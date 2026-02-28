import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, ProductStatus } from '../database/entities/product.entity';
import { Tenant } from '../database/entities/tenant.entity';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { GatewayService } from '../gateway/gateway.service';
import { AuditService } from '../audit/audit.service';
import { ActorType } from '../database/entities/audit-log.entity';
import { RequestUser } from '../common/interfaces/jwt-payload.interface';
import { ConflictException, NotFoundException } from '../common/exceptions/domain-exceptions';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly keycloak: KeycloakAdminService,
    private readonly gateway: GatewayService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateProductDto, actor: RequestUser, ip?: string): Promise<Product> {
    // 1. Validate slug uniqueness in DB
    const existing = await this.productRepo.findOneBy({ slug: dto.slug });
    if (existing) throw new ConflictException(`Product with slug '${dto.slug}' already exists`);

    let publicClientUuid: string | undefined;
    let backendClientUuid: string | undefined;

    try {
      // 2. Create public Keycloak client (PKCE)
      const frontendRedirectUri = dto.frontendUrl || `http://localhost:3000`;
      publicClientUuid = await this.keycloak.createClient({
        clientId: dto.slug,
        name: dto.name,
        description: dto.description || `Frontend client for ${dto.name}`,
        enabled: true,
        publicClient: true,
        standardFlowEnabled: true,
        directAccessGrantsEnabled: false,
        serviceAccountsEnabled: false,
        redirectUris: [`${frontendRedirectUri}/callback`, `${frontendRedirectUri}/*`],
        webOrigins: [frontendRedirectUri],
        attributes: {
          'pkce.code.challenge.method': 'S256',
          'post.logout.redirect.uris': `${frontendRedirectUri}/*`,
        },
        protocol: 'openid-connect',
        fullScopeAllowed: false,
      });

      // 3. Create confidential backend client → get secret
      // Note: using serviceAccountsEnabled to get a client secret
      // (bearerOnly clients don't generate secrets in Keycloak)
      const backendClientId = `${dto.slug}-backend`;
      backendClientUuid = await this.keycloak.createClient({
        clientId: backendClientId,
        name: `${dto.name} Backend`,
        description: `Confidential client for APISIX JWT validation of ${dto.name} APIs`,
        enabled: true,
        publicClient: false,
        standardFlowEnabled: false,
        directAccessGrantsEnabled: false,
        serviceAccountsEnabled: true,
        protocol: 'openid-connect',
      });

      const backendSecret = await this.keycloak.getClientSecret(backendClientUuid);

      // 4. Add realm role scope mappings
      const realmRoles = await this.keycloak.getRealmRoles();
      const customRoles = realmRoles.filter((r) =>
        ['platform_admin', 'tenant_admin', 'tenant_employee', 'end_user'].includes(r.name),
      );
      if (customRoles.length > 0) {
        await this.keycloak.addRealmRoleScopeMappings(publicClientUuid, customRoles);
      }

      // 5. Move organization scope from optional to default scopes
      try {
        const scopes = await this.keycloak.getClientScopes();
        const orgScope = scopes.find((s) => s.name === 'organization');
        if (orgScope) {
          await this.keycloak.removeOptionalClientScope(publicClientUuid, orgScope.id);
          await this.keycloak.addDefaultClientScope(publicClientUuid, orgScope.id);
        }
      } catch (err) {
        this.logger.warn(`Could not configure organization scope: ${(err as Error).message}`);
      }

      // 6. Create APISIX route
      let apisixRouteId: string | undefined;
      if (dto.backendUrl && dto.backendPort) {
        try {
          const routeId = `product-${dto.slug}`;
          const kcBaseUrl = 'http://localhost:8080';
          const routeConfig = this.gateway.buildProductRouteConfig({
            slug: dto.slug,
            backendHost: dto.backendUrl,
            backendPort: dto.backendPort,
            kcDiscovery: `${kcBaseUrl}/realms/doer/.well-known/openid-configuration`,
            oidcClientId: backendClientId,
            oidcClientSecret: backendSecret,
          });
          await this.gateway.upsertRoute(routeId, routeConfig);
          apisixRouteId = routeId;
        } catch (err) {
          this.logger.warn(`Could not create APISIX route: ${(err as Error).message}`);
        }
      }

      // 7. Save product record
      const product = await this.productRepo.save(
        this.productRepo.create({
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          frontendUrl: dto.frontendUrl,
          backendUrl: dto.backendUrl,
          backendPort: dto.backendPort,
          kcPublicClientId: dto.slug,
          kcPublicClientUuid: publicClientUuid,
          kcBackendClientId: `${dto.slug}-backend`,
          kcBackendClientUuid: backendClientUuid,
          kcBackendClientSecret: backendSecret,
          apisixRouteId,
        }),
      );

      // 8. Audit log
      await this.audit.log({
        actorId: actor.id,
        actorType: ActorType.USER,
        action: 'product.created',
        resourceType: 'product',
        resourceId: product.id,
        metadata: { name: dto.name, slug: dto.slug },
        ipAddress: ip,
      });

      return product;
    } catch (err) {
      // Rollback: clean up created Keycloak clients
      if (publicClientUuid) {
        try {
          await this.keycloak.deleteClient(publicClientUuid);
        } catch {
          this.logger.error(`Rollback: failed to delete public client ${publicClientUuid}`);
        }
      }
      if (backendClientUuid) {
        try {
          await this.keycloak.deleteClient(backendClientUuid);
        } catch {
          this.logger.error(`Rollback: failed to delete backend client ${backendClientUuid}`);
        }
      }
      throw err;
    }
  }

  async findAll(): Promise<Product[]> {
    return this.productRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepo.findOneBy({ id });
    if (!product) throw new NotFoundException('Product', id);
    return product;
  }

  async update(id: string, dto: UpdateProductDto, actor: RequestUser, ip?: string): Promise<Product> {
    const product = await this.productRepo.findOneBy({ id });
    if (!product) throw new NotFoundException('Product', id);

    Object.assign(product, dto);
    const updated = await this.productRepo.save(product);

    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: 'product.updated',
      resourceType: 'product',
      resourceId: id,
      metadata: dto as Record<string, unknown>,
      ipAddress: ip,
    });

    return updated;
  }

  async deactivate(id: string, actor: RequestUser, ip?: string): Promise<Product> {
    const product = await this.productRepo.findOneBy({ id });
    if (!product) throw new NotFoundException('Product', id);

    product.status = ProductStatus.INACTIVE;
    const updated = await this.productRepo.save(product);

    // Disable APISIX route if it exists
    if (product.apisixRouteId) {
      try {
        await this.gateway.setRouteStatus(product.apisixRouteId, false);
      } catch (err) {
        this.logger.warn(`Could not disable route: ${(err as Error).message}`);
      }
    }

    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: 'product.deactivated',
      resourceType: 'product',
      resourceId: id,
      ipAddress: ip,
    });

    return updated;
  }

  // ─── Client Roles ───────────────────────────────────────

  async getRoles(id: string): Promise<{ id: string; name: string; description?: string }[]> {
    const product = await this.findOne(id);
    if (!product.kcPublicClientUuid) return [];
    return this.keycloak.getClientRoles(product.kcPublicClientUuid);
  }

  async createRole(
    id: string,
    role: { name: string; description?: string; composite?: boolean },
    actor: RequestUser,
    ip?: string,
  ): Promise<void> {
    const product = await this.findOne(id);
    if (!product.kcPublicClientUuid) {
      throw new NotFoundException('Product has no Keycloak client configured');
    }
    await this.keycloak.createClientRole(product.kcPublicClientUuid, role);

    // Also add to scope mappings so the role appears in tokens
    const roles = await this.keycloak.getClientRoles(product.kcPublicClientUuid);
    const newRole = roles.find((r) => r.name === role.name);
    if (newRole) {
      await this.keycloak.addClientRoleScopeMappings(
        product.kcPublicClientUuid,
        product.kcPublicClientUuid,
        [{ id: newRole.id, name: newRole.name }],
      );
    }

    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: 'product.role.created',
      resourceType: 'product',
      resourceId: id,
      metadata: { roleName: role.name },
      ipAddress: ip,
    });
  }

  async deleteRole(id: string, roleName: string, actor: RequestUser, ip?: string): Promise<void> {
    const product = await this.findOne(id);
    if (!product.kcPublicClientUuid) {
      throw new NotFoundException('Product has no Keycloak client configured');
    }
    await this.keycloak.deleteClientRole(product.kcPublicClientUuid, roleName);

    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: 'product.role.deleted',
      resourceType: 'product',
      resourceId: id,
      metadata: { roleName },
      ipAddress: ip,
    });
  }

  async addComposites(
    id: string,
    roleName: string,
    roleNames: string[],
    actor: RequestUser,
    ip?: string,
  ): Promise<void> {
    const product = await this.findOne(id);
    if (!product.kcPublicClientUuid) {
      throw new NotFoundException('Product has no Keycloak client configured');
    }

    const allRoles = await this.keycloak.getClientRoles(product.kcPublicClientUuid);
    const composites = allRoles.filter((r) => roleNames.includes(r.name));
    await this.keycloak.addCompositeRoles(product.kcPublicClientUuid, roleName, composites);

    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: 'product.role.composites.added',
      resourceType: 'product',
      resourceId: id,
      metadata: { roleName, composites: roleNames },
      ipAddress: ip,
    });
  }

  async getComposites(id: string, roleName: string): Promise<{ id: string; name: string }[]> {
    const product = await this.findOne(id);
    if (!product.kcPublicClientUuid) return [];
    return this.keycloak.getCompositeRoles(product.kcPublicClientUuid, roleName);
  }

  // ─── Route Config ───────────────────────────────────────

  async getRoute(id: string): Promise<Record<string, unknown> | null> {
    const product = await this.findOne(id);
    if (!product.apisixRouteId) return null;
    return this.gateway.getRoute(product.apisixRouteId);
  }

  async updateRoute(
    id: string,
    config: Record<string, unknown>,
    actor: RequestUser,
    ip?: string,
  ): Promise<void> {
    const product = await this.findOne(id);
    const routeId = product.apisixRouteId || `product-${product.slug}`;

    // Build default config as base, merge overrides
    if (product.backendUrl && product.backendPort && product.kcBackendClientId && product.kcBackendClientSecret) {
      const baseConfig = this.gateway.buildProductRouteConfig({
        slug: product.slug,
        backendHost: product.backendUrl,
        backendPort: product.backendPort,
        kcDiscovery: 'http://localhost:8080/realms/doer/.well-known/openid-configuration',
        oidcClientId: product.kcBackendClientId,
        oidcClientSecret: product.kcBackendClientSecret,
      });
      const merged = { ...baseConfig, ...config };
      await this.gateway.upsertRoute(routeId, merged as never);
    } else {
      await this.gateway.upsertRoute(routeId, config as never);
    }

    if (!product.apisixRouteId) {
      product.apisixRouteId = routeId;
      await this.productRepo.save(product);
    }

    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: 'product.route.updated',
      resourceType: 'product',
      resourceId: id,
      ipAddress: ip,
    });
  }

  async toggleRoute(id: string, actor: RequestUser, ip?: string): Promise<{ enabled: boolean }> {
    const product = await this.findOne(id);
    if (!product.apisixRouteId) {
      throw new NotFoundException('Product has no APISIX route configured');
    }

    const route = await this.gateway.getRoute(product.apisixRouteId);
    const currentStatus = (route as Record<string, unknown>)?.status;
    const newEnabled = currentStatus === 0;

    await this.gateway.setRouteStatus(product.apisixRouteId, newEnabled);

    await this.audit.log({
      actorId: actor.id,
      actorType: ActorType.USER,
      action: newEnabled ? 'product.route.enabled' : 'product.route.disabled',
      resourceType: 'product',
      resourceId: id,
      ipAddress: ip,
    });

    return { enabled: newEnabled };
  }

  // ─── Tenants for Product ────────────────────────────────

  async getProductTenants(id: string): Promise<Tenant[]> {
    const product = await this.findOne(id);
    return this.tenantRepo.find({
      where: { product: product.slug },
      order: { createdAt: 'DESC' },
    });
  }
}
