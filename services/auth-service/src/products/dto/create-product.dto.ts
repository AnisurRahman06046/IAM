import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'Doer School' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'doer-school', description: 'Unique slug (used as Keycloak client prefix and APISIX route path)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'Slug must be lowercase alphanumeric with dashes' })
  slug: string;

  @ApiPropertyOptional({ example: 'School management product' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'http://localhost:5174' })
  @IsOptional()
  @IsString()
  frontendUrl?: string;

  @ApiPropertyOptional({ example: 'localhost' })
  @IsOptional()
  @IsString()
  backendUrl?: string;

  @ApiPropertyOptional({ example: 4002 })
  @IsOptional()
  @IsInt()
  @Min(1)
  backendPort?: number;
}
