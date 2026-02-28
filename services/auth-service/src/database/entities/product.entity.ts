import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ProductStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Index({ unique: true })
  @Column({ unique: true })
  slug: string;

  @Column({ nullable: true })
  description: string;

  @Column({ name: 'frontend_url', nullable: true })
  frontendUrl: string;

  @Column({ name: 'backend_url', nullable: true })
  backendUrl: string;

  @Column({ name: 'backend_port', nullable: true, type: 'int' })
  backendPort: number;

  @Column({ name: 'kc_public_client_id', nullable: true })
  kcPublicClientId: string;

  @Column({ name: 'kc_public_client_uuid', nullable: true })
  kcPublicClientUuid: string;

  @Column({ name: 'kc_backend_client_id', nullable: true })
  kcBackendClientId: string;

  @Column({ name: 'kc_backend_client_uuid', nullable: true })
  kcBackendClientUuid: string;

  @Column({ name: 'kc_backend_client_secret', nullable: true })
  kcBackendClientSecret: string;

  @Column({ name: 'apisix_route_id', nullable: true })
  apisixRouteId: string;

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.ACTIVE })
  status: ProductStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
