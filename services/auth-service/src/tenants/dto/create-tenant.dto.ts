import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantPlan } from '../../database/entities/tenant.entity';

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Corporation' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'acme-corp' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/, {
    message: 'Alias must be 2-64 lowercase alphanumeric characters with dashes, cannot start or end with dash',
  })
  alias: string;

  @ApiProperty({ example: 'doer-visa' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  product: string;

  @ApiPropertyOptional({ enum: TenantPlan, default: TenantPlan.BASIC })
  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxUsers?: number;

  @ApiPropertyOptional({ example: 'billing@acme.com' })
  @IsOptional()
  @IsEmail()
  billingEmail?: string;

  @ApiPropertyOptional({ example: 'acme.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @ApiProperty({ description: 'Admin user email for the new tenant' })
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  adminEmail: string;

  @ApiProperty({ example: 'John Admin' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  adminFullName: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/, {
    message: 'Password must contain at least one uppercase, one lowercase, one digit, and one special character',
  })
  adminPassword: string;
}
