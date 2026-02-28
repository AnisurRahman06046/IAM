import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../database/entities/tenant.entity';
import { Product } from '../database/entities/product.entity';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, Product])],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
