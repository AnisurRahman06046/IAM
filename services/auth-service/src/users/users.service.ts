import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Tenant } from '../database/entities/tenant.entity';
import { Invitation, InvitationStatus } from '../database/entities/invitation.entity';
import { ActorType } from '../database/entities/audit-log.entity';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { AuditService } from '../audit/audit.service';
import {
  NotFoundException,
  TenantLimitExceededException,
} from '../common/exceptions/domain-exceptions';
import { RequestUser } from '../common/interfaces/jwt-payload.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateRolesDto } from './dto/update-roles.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Invitation)
    private readonly invitationRepo: Repository<Invitation>,
    private readonly keycloak: KeycloakAdminService,
    private readonly audit: AuditService,
  ) {}

  private async getTenant(tid: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOneBy({ id: tid });
    if (!tenant) throw new NotFoundException('Tenant', tid);
    return tenant;
  }

  async createUser(
    tid: string,
    dto: CreateUserDto,
    actor: RequestUser,
    ip?: string,
  ): Promise<{ userId: string }> {
    const tenant = await this.getTenant(tid);

    // Check user limit
    if (tenant.keycloakOrgId) {
      const count = await this.keycloak.countMembers(tenant.keycloakOrgId);
      if (count >= tenant.maxUsers) {
        throw new TenantLimitExceededException(tenant.name, tenant.maxUsers);
      }
    }

    const nameParts = dto.fullName.trim().split(/\s+/);
    const userId = await this.keycloak.createUser({
      username: dto.email,
      email: dto.email,
      firstName: nameParts[0],
      lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : '',
      enabled: true,
      credentials: [{ type: 'password', value: dto.password, temporary: false }],
      attributes: dto.phone ? { phone: [dto.phone] } : undefined,
    });

    await this.keycloak.assignRealmRoles(userId, [dto.realmRole]);

    if (tenant.keycloakOrgId) {
      await this.keycloak.addMember(tenant.keycloakOrgId, userId);
    }

    if (dto.clientRoles?.length) {
      const clientUuid = await this.keycloak.getClientUuid(tenant.product);
      await this.keycloak.assignClientRoles(userId, clientUuid, dto.clientRoles);
    }

    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: 'user.created',
      resourceType: 'user',
      resourceId: userId,
      tenantId: tid,
      metadata: { email: dto.email, role: dto.realmRole },
      ipAddress: ip,
    });

    return { userId };
  }

  async listUsers(
    tid: string,
    params?: { first?: number; max?: number },
  ): Promise<Record<string, unknown>[]> {
    const tenant = await this.getTenant(tid);
    if (!tenant.keycloakOrgId) return [];
    return this.keycloak.listMembers(tenant.keycloakOrgId, params);
  }

  async getUser(
    tid: string,
    uid: string,
  ): Promise<Record<string, unknown>> {
    const tenant = await this.getTenant(tid);
    const user = await this.keycloak.getUserById(uid);

    // Get client roles
    let clientRoles: { id: string; name: string }[] = [];
    try {
      const clientUuid = await this.keycloak.getClientUuid(tenant.product);
      clientRoles = await this.keycloak.getUserClientRoles(uid, clientUuid);
    } catch {
      // Client may not exist
    }

    return {
      ...user,
      clientRoles: clientRoles.map((r) => r.name),
    };
  }

  async updateRoles(
    tid: string,
    uid: string,
    dto: UpdateRolesDto,
    actor: RequestUser,
    ip?: string,
  ): Promise<void> {
    const tenant = await this.getTenant(tid);

    if (dto.realmRole) {
      await this.keycloak.assignRealmRoles(uid, [dto.realmRole]);
    }

    if (dto.clientRoles) {
      const clientUuid = await this.keycloak.getClientUuid(tenant.product);
      // Get current roles and remove them, then assign new ones
      const current = await this.keycloak.getUserClientRoles(uid, clientUuid);
      if (current.length > 0) {
        await this.keycloak.removeClientRoles(
          uid,
          clientUuid,
          current.map((r) => r.name),
        );
      }
      if (dto.clientRoles.length > 0) {
        await this.keycloak.assignClientRoles(uid, clientUuid, dto.clientRoles);
      }
    }

    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: 'user.roles_updated',
      resourceType: 'user',
      resourceId: uid,
      tenantId: tid,
      metadata: dto as Record<string, unknown>,
      ipAddress: ip,
    });
  }

  async disableUser(tid: string, uid: string, actor: RequestUser, ip?: string): Promise<void> {
    await this.getTenant(tid);
    await this.keycloak.disableUser(uid);
    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: 'user.disabled',
      resourceType: 'user',
      resourceId: uid,
      tenantId: tid,
      ipAddress: ip,
    });
  }

  async enableUser(tid: string, uid: string, actor: RequestUser, ip?: string): Promise<void> {
    await this.getTenant(tid);
    await this.keycloak.enableUser(uid);
    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: 'user.enabled',
      resourceType: 'user',
      resourceId: uid,
      tenantId: tid,
      ipAddress: ip,
    });
  }

  async removeUser(tid: string, uid: string, actor: RequestUser, ip?: string): Promise<void> {
    const tenant = await this.getTenant(tid);
    if (tenant.keycloakOrgId) {
      await this.keycloak.removeMember(tenant.keycloakOrgId, uid);
    }
    await this.keycloak.disableUser(uid);

    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: 'user.removed',
      resourceType: 'user',
      resourceId: uid,
      tenantId: tid,
      ipAddress: ip,
    });
  }

  async createInvitation(
    tid: string,
    dto: CreateInvitationDto,
    actor: RequestUser,
    ip?: string,
  ): Promise<Invitation> {
    await this.getTenant(tid);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresInHours = dto.expiresInHours || 72;

    const invitation = await this.invitationRepo.save(
      this.invitationRepo.create({
        tenantId: tid,
        email: dto.email,
        role: dto.role,
        token,
        expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
        invitedBy: actor.id,
      }),
    );

    // TODO: Send invitation email

    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: 'invitation.created',
      resourceType: 'invitation',
      resourceId: invitation.id,
      tenantId: tid,
      metadata: { email: dto.email, role: dto.role },
      ipAddress: ip,
    });

    return invitation;
  }

  async getAvailableRoles(tid: string): Promise<{ id: string; name: string; description?: string }[]> {
    const tenant = await this.getTenant(tid);
    const clientUuid = await this.keycloak.getClientUuid(tenant.product);
    return this.keycloak.getClientRoles(clientUuid);
  }
}
