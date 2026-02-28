import { Injectable } from '@nestjs/common';
import { RegistrationStrategy } from './registration-strategy.interface';
import { RegisterDto } from '../dto/register.dto';
import { RegistrationConfig } from '../../database/entities/registration-config.entity';
import { ValidationException } from '../../common/exceptions/domain-exceptions';

@Injectable()
export class VisaRegistrationStrategy implements RegistrationStrategy {
  validate(dto: RegisterDto, config: RegistrationConfig): void {
    for (const field of config.requiredFields) {
      if (!dto[field as keyof RegisterDto]) {
        throw new ValidationException(`Field '${field}' is required for ${config.product}`);
      }
    }

    const rules = config.validationRules as Record<string, { pattern?: string; minLength?: number }>;
    if (rules.phone?.pattern && dto.phone) {
      const regex = new RegExp(rules.phone.pattern);
      if (!regex.test(dto.phone)) {
        throw new ValidationException('Invalid phone number format');
      }
    }

    if (rules.password?.minLength && dto.password.length < rules.password.minLength) {
      throw new ValidationException(
        `Password must be at least ${rules.password.minLength} characters`,
      );
    }
  }

  getKeycloakAttributes(dto: RegisterDto): Record<string, string[]> {
    return {
      phone: [dto.phone],
    };
  }
}
