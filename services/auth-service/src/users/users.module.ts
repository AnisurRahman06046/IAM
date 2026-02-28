import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../database/entities/tenant.entity';
import { Invitation } from '../database/entities/invitation.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { TenantScopeGuard } from '../common/guards/tenant-scope.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, Invitation])],
  controllers: [UsersController],
  providers: [UsersService, TenantScopeGuard],
})
export class UsersModule {}
