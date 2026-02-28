import { DataSource } from 'typeorm';
import { RegistrationConfig } from '../entities/registration-config.entity';

export async function seedRegistrationConfigs(dataSource: DataSource) {
  const repo = dataSource.getRepository(RegistrationConfig);

  const existing = await repo.findOneBy({ product: 'doer-visa' });
  if (existing) return;

  await repo.save(
    repo.create({
      product: 'doer-visa',
      requiredFields: ['email', 'fullName', 'phone', 'password'],
      validationRules: {
        phone: { pattern: '^\\+?[1-9]\\d{7,14}$' },
        password: { minLength: 8 },
      },
      defaultRealmRole: 'end_user',
      defaultClientRoles: ['apply_visa', 'view_own_status'],
      selfRegistrationEnabled: true,
    }),
  );
}
