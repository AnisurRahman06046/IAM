import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  refreshToken: string;

  @ApiProperty({ example: 'doer-visa' })
  @IsNotEmpty()
  @IsString()
  clientId: string;
}
