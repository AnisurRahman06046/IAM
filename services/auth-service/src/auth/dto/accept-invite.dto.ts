import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptInviteDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  token: string;

  @ApiProperty({ example: 'Jane Smith' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiProperty({ example: '+966501234567' })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiProperty({ example: 'SecureP@ss1' })
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}
