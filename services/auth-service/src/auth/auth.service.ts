import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { RegistrationConfig } from '../database/entities/registration-config.entity';
import { Invitation, InvitationStatus } from '../database/entities/invitation.entity';
import { Tenant } from '../database/entities/tenant.entity';
import { ActorType } from '../database/entities/audit-log.entity';
import {
  ConflictException,
  InvitationExpiredException,
  NotFoundException,
  TenantLimitExceededException,
  ValidationException,
} from '../common/exceptions/domain-exceptions';
import { RegisterDto } from './dto/register.dto';
import { TokenExchangeDto } from './dto/token-exchange.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { RegistrationStrategy } from './strategies/registration-strategy.interface';
import { VisaRegistrationStrategy } from './strategies/visa-registration.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly strategies: Map<string, RegistrationStrategy>;

  constructor(
    @InjectRepository(RegistrationConfig)
    private readonly regConfigRepo: Repository<RegistrationConfig>,
    @InjectRepository(Invitation)
    private readonly invitationRepo: Repository<Invitation>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly keycloak: KeycloakAdminService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    visaStrategy: VisaRegistrationStrategy,
  ) {
    this.strategies = new Map([
      ['doer-visa', visaStrategy],
    ]);
  }

  // ─── Register ───────────────────────────────────────────────

  async register(dto: RegisterDto, ip?: string): Promise<{ userId: string }> {
    const config = await this.regConfigRepo.findOneBy({ product: dto.product });
    if (!config) throw new NotFoundException('Registration config', dto.product);
    if (!config.selfRegistrationEnabled) {
      throw new ValidationException('Self-registration is not enabled for this product');
    }

    const strategy = this.strategies.get(dto.product);
    if (strategy) {
      strategy.validate(dto, config);
    }

    // Check user uniqueness
    const existing = await this.keycloak.getUserByEmail(dto.email);
    if (existing) throw new ConflictException('A user with this email already exists');

    // Resolve tenant
    let tenant: Tenant | null = null;
    if (dto.tenantAlias) {
      tenant = await this.tenantRepo.findOneBy({ alias: dto.tenantAlias });
      if (!tenant) throw new NotFoundException('Tenant', dto.tenantAlias);

      // Check tenant user limit
      if (tenant.keycloakOrgId) {
        const memberCount = await this.keycloak.countMembers(tenant.keycloakOrgId);
        if (memberCount >= tenant.maxUsers) {
          throw new TenantLimitExceededException(tenant.name, tenant.maxUsers);
        }
      }
    }

    // Parse fullName
    const nameParts = dto.fullName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    // Build Keycloak attributes
    const attributes = strategy
      ? strategy.getKeycloakAttributes(dto)
      : { phone: [dto.phone] };

    // Create user in Keycloak
    const userId = await this.keycloak.createUser({
      username: dto.email,
      email: dto.email,
      firstName,
      lastName,
      enabled: true,
      credentials: [{ type: 'password', value: dto.password, temporary: false }],
      attributes,
    });

    // Assign default realm role
    await this.keycloak.assignRealmRoles(userId, [config.defaultRealmRole]);

    // Assign default client roles
    if (config.defaultClientRoles.length > 0) {
      const clientUuid = await this.keycloak.getClientUuid(dto.product);
      await this.keycloak.assignClientRoles(userId, clientUuid, config.defaultClientRoles);
    }

    // Add to organization if tenant exists
    if (tenant?.keycloakOrgId) {
      await this.keycloak.addMember(tenant.keycloakOrgId, userId);
    }

    await this.audit.log({
      actorId: userId,
      actorType: ActorType.USER,
      action: 'user.registered',
      resourceType: 'user',
      resourceId: userId,
      tenantId: tenant?.id,
      metadata: { product: dto.product, email: dto.email },
      ipAddress: ip,
    });

    return { userId };
  }

  // ─── Token Operations ──────────────────────────────────────

  async exchangeToken(dto: TokenExchangeDto) {
    const data = await this.keycloak.exchangeCodeForTokens(
      dto.code,
      dto.codeVerifier,
      dto.redirectUri,
      dto.clientId,
    );
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    };
  }

  async refresh(dto: RefreshTokenDto) {
    const data = await this.keycloak.refreshToken(dto.refreshToken, dto.clientId);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    };
  }

  async logout(dto: LogoutDto): Promise<void> {
    await this.keycloak.revokeToken(dto.refreshToken, dto.clientId);
  }

  // ─── Forgot / Reset Password ──────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ method: string; expiresIn?: number }> {
    const isEmail = dto.identifier.includes('@');

    if (isEmail) {
      const user = await this.keycloak.getUserByEmail(dto.identifier);
      if (!user) throw new NotFoundException('User', dto.identifier);
      await this.keycloak.sendActionsEmail(user.id as string, ['UPDATE_PASSWORD']);
      return { method: 'email' };
    }

    // Phone-based OTP
    const phone = dto.identifier;
    const otp = this.generateOtp();
    const hash = await bcrypt.hash(otp, 10);

    const ttl = 300; // 5 minutes
    await this.redis.setEx(`otp:pwd_reset:${phone}`, ttl, JSON.stringify({
      hash,
      attempts: 0,
      maxAttempts: 5,
    }));

    // TODO: Send OTP via SMS provider
    this.logger.log(`[DEV] OTP for ${phone}: ${otp}`);

    return { method: 'otp', expiresIn: ttl };
  }

  async resetPassword(dto: ResetPasswordDto, ip?: string): Promise<void> {
    const key = `otp:pwd_reset:${dto.phone}`;
    const raw = await this.redis.get(key);
    if (!raw) throw new ValidationException('OTP expired or not found');

    const otpData = JSON.parse(raw) as { hash: string; attempts: number; maxAttempts: number };

    if (otpData.attempts >= otpData.maxAttempts) {
      await this.redis.del(key);
      throw new ValidationException('Maximum OTP attempts exceeded');
    }

    const valid = await bcrypt.compare(dto.otp, otpData.hash);
    if (!valid) {
      otpData.attempts++;
      await this.redis.setEx(key, 300, JSON.stringify(otpData));
      throw new ValidationException('Invalid OTP');
    }

    // Find user by phone
    const users = await this.keycloak.searchUsers(dto.phone);
    if (!users.length) throw new NotFoundException('User', dto.phone);

    const userId = users[0].id as string;
    await this.keycloak.resetPassword(userId, dto.newPassword);
    await this.redis.del(key);

    await this.audit.log({
      actorId: userId,
      actorType: ActorType.USER,
      action: 'user.password_reset',
      resourceType: 'user',
      resourceId: userId,
      ipAddress: ip,
    });
  }

  // ─── Invitation ────────────────────────────────────────────

  async getInvitation(token: string) {
    const invitation = await this.invitationRepo.findOne({
      where: { token, status: InvitationStatus.PENDING },
      relations: ['tenant'],
    });

    if (!invitation) throw new NotFoundException('Invitation');
    if (invitation.expiresAt < new Date()) {
      await this.invitationRepo.update(invitation.id, { status: InvitationStatus.EXPIRED });
      throw new InvitationExpiredException();
    }

    return {
      tenantName: invitation.tenant.name,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    };
  }

  async acceptInvite(dto: AcceptInviteDto, ip?: string): Promise<{ userId: string }> {
    const invitation = await this.invitationRepo.findOne({
      where: { token: dto.token, status: InvitationStatus.PENDING },
      relations: ['tenant'],
    });

    if (!invitation) throw new NotFoundException('Invitation');
    if (invitation.expiresAt < new Date()) {
      await this.invitationRepo.update(invitation.id, { status: InvitationStatus.EXPIRED });
      throw new InvitationExpiredException();
    }

    const tenant = invitation.tenant;

    // Check user limit
    if (tenant.keycloakOrgId) {
      const memberCount = await this.keycloak.countMembers(tenant.keycloakOrgId);
      if (memberCount >= tenant.maxUsers) {
        throw new TenantLimitExceededException(tenant.name, tenant.maxUsers);
      }
    }

    // Parse name
    const nameParts = dto.fullName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    // Create user
    const userId = await this.keycloak.createUser({
      username: invitation.email,
      email: invitation.email,
      firstName,
      lastName,
      enabled: true,
      credentials: [{ type: 'password', value: dto.password, temporary: false }],
      attributes: { phone: [dto.phone] },
    });

    // Assign role
    await this.keycloak.assignRealmRoles(userId, [invitation.role]);

    // Add to org
    if (tenant.keycloakOrgId) {
      await this.keycloak.addMember(tenant.keycloakOrgId, userId);
    }

    // Mark invitation as accepted
    await this.invitationRepo.update(invitation.id, {
      status: InvitationStatus.ACCEPTED,
      acceptedAt: new Date(),
    });

    await this.audit.log({
      actorId: userId,
      actorType: ActorType.USER,
      action: 'invitation.accepted',
      resourceType: 'invitation',
      resourceId: invitation.id,
      tenantId: tenant.id,
      metadata: { email: invitation.email, role: invitation.role },
      ipAddress: ip,
    });

    return { userId };
  }

  private generateOtp(): string {
    return crypto.randomInt(100000, 999999).toString();
  }
}
