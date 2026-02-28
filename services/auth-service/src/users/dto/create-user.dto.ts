import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'Jane Smith' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  fullName: string;

  @ApiPropertyOptional({ example: '+966501234567' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Phone must be in E.164 format' })
  phone?: string;

  @ApiProperty()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/, {
    message: 'Password must contain at least one uppercase, one lowercase, one digit, and one special character',
  })
  password: string;

  @ApiProperty({ example: 'tenant_employee' })
  @IsNotEmpty()
  @IsString()
  @IsIn(['end_user', 'tenant_employee', 'tenant_admin'], {
    message: 'Realm role must be one of: end_user, tenant_employee, tenant_admin',
  })
  realmRole: string;

  @ApiPropertyOptional({ description: 'Client roles to assign', type: [String] })
  @IsOptional()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  clientRoles?: string[];
}
