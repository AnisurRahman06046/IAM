import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Email or phone number', example: 'user@example.com' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  identifier: string;

  @ApiProperty({ example: 'doer-visa' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  product: string;
}
