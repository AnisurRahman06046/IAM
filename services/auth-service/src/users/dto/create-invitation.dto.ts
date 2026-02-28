import { IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInvitationDto {
  @ApiProperty({ example: 'newuser@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'tenant_employee' })
  @IsNotEmpty()
  @IsString()
  @IsIn(['end_user', 'tenant_employee', 'tenant_admin'], {
    message: 'Role must be one of: end_user, tenant_employee, tenant_admin',
  })
  role: string;

  @ApiPropertyOptional({ description: 'Expiration in hours (1-720)', example: 72 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  expiresInHours?: number;
}
