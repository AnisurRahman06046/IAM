import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInvitationDto {
  @ApiProperty({ example: 'newuser@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'tenant_employee' })
  @IsNotEmpty()
  @IsString()
  role: string;

  @ApiPropertyOptional({ description: 'Expiration in hours', example: 72 })
  @IsOptional()
  expiresInHours?: number;
}
