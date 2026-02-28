import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Jane Smith' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiPropertyOptional({ example: '+966501234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'tenant_employee' })
  @IsNotEmpty()
  @IsString()
  realmRole: string;

  @ApiPropertyOptional({ description: 'Client roles to assign', type: [String] })
  @IsOptional()
  @IsString({ each: true })
  clientRoles?: string[];
}
