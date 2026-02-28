import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRolesDto {
  @ApiPropertyOptional({ example: 'tenant_employee' })
  @IsOptional()
  @IsString()
  realmRole?: string;

  @ApiPropertyOptional({ description: 'Client roles to set (replaces existing)', type: [String] })
  @IsOptional()
  @IsString({ each: true })
  clientRoles?: string[];
}
