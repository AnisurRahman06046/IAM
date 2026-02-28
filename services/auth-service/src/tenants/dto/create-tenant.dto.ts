import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantPlan } from '../../database/entities/tenant.entity';

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Corporation' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'acme-corp' })
  @IsNotEmpty()
  @IsString()
  alias: string;

  @ApiProperty({ example: 'doer-visa' })
  @IsNotEmpty()
  @IsString()
  product: string;

  @ApiPropertyOptional({ enum: TenantPlan, default: TenantPlan.BASIC })
  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsers?: number;

  @ApiPropertyOptional({ example: 'billing@acme.com' })
  @IsOptional()
  @IsEmail()
  billingEmail?: string;

  @ApiPropertyOptional({ example: 'acme.com' })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiProperty({ description: 'Admin user email for the new tenant' })
  @IsNotEmpty()
  @IsEmail()
  adminEmail: string;

  @ApiProperty({ example: 'John Admin' })
  @IsNotEmpty()
  @IsString()
  adminFullName: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  adminPassword: string;
}
