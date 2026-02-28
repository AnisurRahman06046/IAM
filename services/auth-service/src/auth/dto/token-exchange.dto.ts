import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TokenExchangeDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  codeVerifier: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  redirectUri: string;

  @ApiProperty({ example: 'doer-visa' })
  @IsNotEmpty()
  @IsString()
  clientId: string;
}
