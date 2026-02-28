import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRolesDto {
  @ApiPropertyOptional({ example: 'tenant_employee' })
  @IsOptional()
  @IsString()
  @IsIn(['end_user', 'tenant_employee', 'tenant_admin'], {
    message: 'Realm role must be one of: end_user, tenant_employee, tenant_admin',
  })
  realmRole?: string;

  @ApiPropertyOptional({ description: 'Client roles to set (replaces existing)', type: [String] })
  @IsOptional()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  clientRoles?: string[];
}
