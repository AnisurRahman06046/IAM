import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../database/entities/tenant.entity';
import { Product } from '../database/entities/product.entity';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PlatformService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly keycloak: KeycloakAdminService,
    private readonly audit: AuditService,
  ) {}

  async getStats(): Promise<{
    totalTenants: number;
    activeTenants: number;
    totalUsers: number;
    totalProducts: number;
  }> {
    const totalTenants = await this.tenantRepo.count();
    const activeTenants = await this.tenantRepo.count({ where: { status: 'active' as never } });
    const totalProducts = await this.productRepo.count();

    // Get total users from Keycloak
    const allUsers = await this.keycloak.searchUsers('', { first: 0, max: 10000 });

    return {
      totalTenants,
      activeTenants,
      totalUsers: allUsers.length,
      totalProducts,
    };
  }

  async getAuditLogs(filters: {
    tenantId?: string;
    actorId?: string;
    action?: string;
    resourceType?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    return this.audit.findAll({
      ...filters,
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(filters.to) : undefined,
      first: (page - 1) * limit,
      max: limit,
    });
  }

  async searchUsers(query: string, params?: { first?: number; max?: number }) {
    return this.keycloak.searchUsers(query, params);
  }
}
