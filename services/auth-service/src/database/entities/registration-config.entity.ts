import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('registration_configs')
export class RegistrationConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ unique: true })
  product: string;

  @Column({ name: 'required_fields', type: 'jsonb', default: '[]' })
  requiredFields: string[];

  @Column({ name: 'validation_rules', type: 'jsonb', default: '{}' })
  validationRules: Record<string, unknown>;

  @Column({ name: 'default_realm_role', default: 'end_user' })
  defaultRealmRole: string;

  @Column({ name: 'default_client_roles', type: 'jsonb', default: '[]' })
  defaultClientRoles: string[];

  @Column({ name: 'self_registration_enabled', default: true })
  selfRegistrationEnabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
