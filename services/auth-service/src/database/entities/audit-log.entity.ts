import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum ActorType {
  USER = 'user',
  SYSTEM = 'system',
  SERVICE = 'service',
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'actor_id' })
  actorId: string;

  @Column({ name: 'actor_type', type: 'enum', enum: ActorType })
  actorType: ActorType;

  @Index()
  @Column()
  action: string;

  @Column({ name: 'resource_type' })
  resourceType: string;

  @Column({ name: 'resource_id', nullable: true })
  resourceId: string;

  @Index()
  @Column({ name: 'tenant_id', nullable: true })
  tenantId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @Column({ name: 'ip_address', nullable: true })
  ipAddress: string;

  @CreateDateColumn({ name: 'created_at' })
  @Index()
  createdAt: Date;
}
