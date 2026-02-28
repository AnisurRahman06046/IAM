import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistrationConfig } from '../database/entities/registration-config.entity';
import { Invitation } from '../database/entities/invitation.entity';
import { Tenant } from '../database/entities/tenant.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { VisaRegistrationStrategy } from './strategies/visa-registration.strategy';

@Module({
  imports: [TypeOrmModule.forFeature([RegistrationConfig, Invitation, Tenant])],
  controllers: [AuthController],
  providers: [AuthService, VisaRegistrationStrategy],
})
export class AuthModule {}
