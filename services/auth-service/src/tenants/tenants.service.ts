import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, TenantStatus } from '../database/entities/tenant.entity';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { AuditService } from '../audit/audit.service';
import { ActorType } from '../database/entities/audit-log.entity';
import { NotFoundException, ConflictException } from '../common/exceptions/domain-exceptions';
import { RequestUser } from '../common/interfaces/jwt-payload.interface';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly keycloak: KeycloakAdminService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateTenantDto, actor: RequestUser, ip?: string): Promise<Tenant> {
    // Check alias uniqueness in DB first
    const existing = await this.tenantRepo.findOneBy({ alias: dto.alias });
    if (existing) {
      throw new ConflictException(`Tenant with alias '${dto.alias}' already exists`);
    }

    // Create Keycloak organization (use alias as both name and alias)
    let orgId: string;
    try {
      orgId = await this.keycloak.createOrganization({
        name: dto.alias,
        attributes: {
          product: [dto.product],
          plan: [dto.plan || 'basic'],
          displayName: [dto.name],
        },
      });
    } catch (err) {
      // If org already exists in Keycloak (orphaned from a previous failed attempt),
      // try to find it and reuse it
      if ((err as any).status === 409 || (err as any).message?.includes('already exists')) {
        this.logger.warn(`Organization '${dto.alias}' already exists in Keycloak, attempting to reuse`);
        try {
          const orgs = await this.keycloak.searchOrganizations(dto.alias);
          const match = orgs.find((o: any) => o.name === dto.alias || o.alias === dto.alias);
          if (match) {
            orgId = match.id as string;
          } else {
            throw err;
          }
        } catch {
          throw err;
        }
      } else {
        throw err;
      }
    }

    // Create tenant record
    let tenant: Tenant;
    try {
      tenant = await this.tenantRepo.save(
        this.tenantRepo.create({
          name: dto.name,
          alias: dto.alias,
          product: dto.product,
          plan: dto.plan,
          maxUsers: dto.maxUsers,
          billingEmail: dto.billingEmail,
          domain: dto.domain,
          keycloakOrgId: orgId,
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to save tenant, cleaning up Keycloak org: ${(err as Error).message}`);
      try { await this.keycloak.deleteOrganization(orgId); } catch {}
      throw err;
    }

    // Create admin user in Keycloak
    let adminUserId: string;
    try {
      const nameParts = dto.adminFullName.trim().split(/\s+/);
      adminUserId = await this.keycloak.createUser({
        username: dto.adminEmail,
        email: dto.adminEmail,
        firstName: nameParts[0],
        lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : '',
        enabled: true,
        emailVerified: true,
        // SECURITY: temporary=true forces password change on first login
        credentials: [{ type: 'password', value: dto.adminPassword, temporary: true }],
      });
    } catch (err) {
      this.logger.error(`Failed to create admin user: ${(err as Error).message}`);
      // Don't rollback tenant — it's created, admin can be added later
      throw err;
    }

    // Assign tenant_admin role + add to org
    await this.keycloak.assignRealmRoles(adminUserId, ['tenant_admin']);
    await this.keycloak.addMember(orgId, adminUserId);

    // Assign client roles for the product
    try {
      const clientUuid = await this.keycloak.getClientUuid(dto.product);
      await this.keycloak.assignClientRoles(adminUserId, clientUuid, ['manage_all']);
    } catch (err) {
      this.logger.warn(`Could not assign client roles: ${(err as Error).message}`);
    }

    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: 'tenant.created',
      resourceType: 'tenant',
      resourceId: tenant.id,
      metadata: { name: dto.name, alias: dto.alias, adminEmail: dto.adminEmail },
      ipAddress: ip,
    });

    return tenant;
  }

  async findAll(pagination: PaginationDto, actor: RequestUser): Promise<PaginatedResult<Tenant>> {
    const qb = this.tenantRepo.createQueryBuilder('t');

    // tenant_admin can only see their own tenant
    if (!actor.realmRoles.includes('platform_admin') && actor.organizationId) {
      qb.andWhere('t.alias = :orgAlias', { orgAlias: actor.organizationId });
    }

    qb.orderBy('t.createdAt', 'DESC');
    qb.skip(pagination.offset).take(pagination.limit);

    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResult(items, total, pagination);
  }

  async findOne(id: string): Promise<Tenant & { memberCount: number }> {
    const tenant = await this.tenantRepo.findOneBy({ id });
    if (!tenant) throw new NotFoundException('Tenant', id);

    let memberCount = 0;
    if (tenant.keycloakOrgId) {
      memberCount = await this.keycloak.countMembers(tenant.keycloakOrgId);
    }

    return { ...tenant, memberCount };
  }

  async update(
    id: string,
    dto: UpdateTenantDto,
    actor: RequestUser,
    ip?: string,
  ): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOneBy({ id });
    if (!tenant) throw new NotFoundException('Tenant', id);

    // SECURITY: Whitelist only safe fields to prevent mass assignment
    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.plan !== undefined) tenant.plan = dto.plan;
    if (dto.maxUsers !== undefined) tenant.maxUsers = dto.maxUsers;
    if (dto.billingEmail !== undefined) tenant.billingEmail = dto.billingEmail;
    if (dto.domain !== undefined) tenant.domain = dto.domain;
    const updated = await this.tenantRepo.save(tenant);

    // Sync to Keycloak org attributes
    if (tenant.keycloakOrgId && (dto.plan || dto.name)) {
      const attrs: Record<string, string[]> = {};
      if (dto.plan) attrs.plan = [dto.plan];
      if (dto.name) attrs.displayName = [dto.name];
      await this.keycloak.updateOrganization(tenant.keycloakOrgId, { attributes: attrs });
    }

    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: 'tenant.updated',
      resourceType: 'tenant',
      resourceId: id,
      tenantId: id,
      metadata: dto as Record<string, unknown>,
      ipAddress: ip,
    });

    return updated;
  }

  async activate(id: string, actor: RequestUser, ip?: string): Promise<void> {
    const tenant = await this.tenantRepo.findOneBy({ id });
    if (!tenant) throw new NotFoundException('Tenant', id);

    // Enable all org members
    if (tenant.keycloakOrgId) {
      const members = await this.keycloak.listMembers(tenant.keycloakOrgId);
      for (const member of members) {
        await this.keycloak.enableUser(member.id as string);
      }
    }

    tenant.status = TenantStatus.ACTIVE;
    await this.tenantRepo.save(tenant);

    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: 'tenant.activated',
      resourceType: 'tenant',
      resourceId: id,
      tenantId: id,
      ipAddress: ip,
    });
  }

  async deactivate(id: string, actor: RequestUser, ip?: string): Promise<void> {
    const tenant = await this.tenantRepo.findOneBy({ id });
    if (!tenant) throw new NotFoundException('Tenant', id);

    // Disable all org members + logout sessions
    if (tenant.keycloakOrgId) {
      const members = await this.keycloak.listMembers(tenant.keycloakOrgId);
      for (const member of members) {
        const uid = member.id as string;
        await this.keycloak.disableUser(uid);
        try {
          await this.keycloak.logoutUser(uid);
        } catch {
          // User may not have active sessions
        }
      }
    }

    tenant.status = TenantStatus.INACTIVE;
    await this.tenantRepo.save(tenant);

    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: 'tenant.deactivated',
      resourceType: 'tenant',
      resourceId: id,
      tenantId: id,
      ipAddress: ip,
    });
  }
}
