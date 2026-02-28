import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, TenantStatus } from '../database/entities/tenant.entity';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { AuditService } from '../audit/audit.service';
import { ActorType } from '../database/entities/audit-log.entity';
import { NotFoundException } from '../common/exceptions/domain-exceptions';
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
    // Create Keycloak organization
    const orgId = await this.keycloak.createOrganization({
      name: dto.alias,
      attributes: {
        product: [dto.product],
        plan: [dto.plan || 'basic'],
        displayName: [dto.name],
      },
    });

    // Create tenant record
    const tenant = await this.tenantRepo.save(
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

    // Create admin user in Keycloak
    const nameParts = dto.adminFullName.trim().split(/\s+/);
    const adminUserId = await this.keycloak.createUser({
      username: dto.adminEmail,
      email: dto.adminEmail,
      firstName: nameParts[0],
      lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : '',
      enabled: true,
      credentials: [{ type: 'password', value: dto.adminPassword, temporary: false }],
    });

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

    Object.assign(tenant, dto);
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
