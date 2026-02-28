import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: '+966501234567' })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  @IsString()
  otp: string;

  @ApiProperty({ example: 'NewSecureP@ss1' })
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}
