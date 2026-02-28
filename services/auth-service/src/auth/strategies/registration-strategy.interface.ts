import { RegisterDto } from '../dto/register.dto';
import { RegistrationConfig } from '../../database/entities/registration-config.entity';

export interface RegistrationStrategy {
  validate(dto: RegisterDto, config: RegistrationConfig): void;
  getKeycloakAttributes(dto: RegisterDto): Record<string, string[]>;
}
