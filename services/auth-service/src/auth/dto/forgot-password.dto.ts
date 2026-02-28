import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Email or phone number', example: 'user@example.com' })
  @IsNotEmpty()
  @IsString()
  identifier: string;

  @ApiProperty({ example: 'doer-visa' })
  @IsNotEmpty()
  @IsString()
  product: string;
}
