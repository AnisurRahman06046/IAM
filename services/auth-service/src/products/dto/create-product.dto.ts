import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'My Product' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'my-product', description: 'Unique slug (used as Keycloak client prefix and APISIX route path)' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'Slug must be lowercase alphanumeric with dashes' })
  slug: string;

  @ApiPropertyOptional({ example: 'Product description' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'http://localhost:5174' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  frontendUrl?: string;

  @ApiPropertyOptional({ example: 'localhost' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  backendUrl?: string;

  @ApiPropertyOptional({ example: 4002 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  backendPort?: number;

  @ApiPropertyOptional({
    example: [
      { name: 'create_application', description: 'Submit new visa applications' },
      { name: 'view_application', description: 'View visa applications' },
      { name: 'process_application', description: 'Process visa applications' },
      { name: 'approve_application', description: 'Approve or reject applications' },
    ],
    description: 'Granular permissions (simple client roles)',
  })
  @IsOptional()
  @IsArray()
  permissions?: { name: string; description?: string }[];

  @ApiPropertyOptional({
    example: [
      { name: 'admin', description: 'Full access', permissions: ['create_application', 'view_application', 'process_application', 'approve_application'] },
      { name: 'employee', description: 'Can create and view', permissions: ['create_application', 'view_application'] },
    ],
    description: 'Roles (composite client roles) — each bundles a set of permissions',
  })
  @IsOptional()
  @IsArray()
  roles?: { name: string; description?: string; permissions: string[] }[];

  @ApiPropertyOptional({ example: 'employee', description: 'Default role auto-assigned on self-registration' })
  @IsOptional()
  @IsString()
  defaultRole?: string;
}
