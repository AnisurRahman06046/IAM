import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, ActorType } from '../database/entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async log(params: {
    actorId: string;
    actorType?: ActorType;
    action: string;
    resourceType: string;
    resourceId?: string;
    tenantId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  }): Promise<void> {
    await this.auditRepo.save(
      this.auditRepo.create({
        actorType: ActorType.USER,
        ...params,
      }),
    );
  }

  async findAll(filters: {
    tenantId?: string;
    actorId?: string;
    action?: string;
    resourceType?: string;
    from?: Date;
    to?: Date;
    first?: number;
    max?: number;
  }): Promise<{ items: AuditLog[]; total: number }> {
    const qb = this.auditRepo.createQueryBuilder('log');

    if (filters.tenantId) qb.andWhere('log.tenantId = :tenantId', { tenantId: filters.tenantId });
    if (filters.actorId) qb.andWhere('log.actorId = :actorId', { actorId: filters.actorId });
    if (filters.action) qb.andWhere('log.action = :action', { action: filters.action });
    if (filters.resourceType) qb.andWhere('log.resourceType = :resourceType', { resourceType: filters.resourceType });
    if (filters.from) qb.andWhere('log.createdAt >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('log.createdAt <= :to', { to: filters.to });

    qb.orderBy('log.createdAt', 'DESC');
    qb.skip(filters.first || 0).take(filters.max || 20);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }
}
