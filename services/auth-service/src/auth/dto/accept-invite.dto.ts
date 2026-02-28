import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptInviteDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(256)
  token: string;

  @ApiProperty({ example: 'Jane Smith' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  fullName: string;

  @ApiProperty({ example: '+966501234567' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Phone must be in E.164 format' })
  phone: string;

  @ApiProperty({ example: 'SecureP@ss1' })
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/, {
    message: 'Password must contain at least one uppercase, one lowercase, one digit, and one special character',
  })
  password: string;
}
