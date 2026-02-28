import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum TenantPlan {
  BASIC = 'basic',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export enum TenantStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'keycloak_org_id', nullable: true })
  keycloakOrgId: string;

  @Column()
  name: string;

  @Index({ unique: true })
  @Column({ unique: true })
  alias: string;

  @Column()
  product: string;

  @Column({ type: 'enum', enum: TenantPlan, default: TenantPlan.BASIC })
  plan: TenantPlan;

  @Column({ name: 'max_users', default: 50 })
  maxUsers: number;

  @Column({ type: 'enum', enum: TenantStatus, default: TenantStatus.ACTIVE })
  status: TenantStatus;

  @Column({ name: 'billing_email', nullable: true })
  billingEmail: string;

  @Column({ nullable: true })
  domain: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
