import { IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'My Product' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'my-product', description: 'Unique slug (used as Keycloak client prefix and APISIX route path)' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'Slug must be lowercase alphanumeric with dashes' })
  slug: string;

  @ApiPropertyOptional({ example: 'Product description' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'http://localhost:5174' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  frontendUrl?: string;

  @ApiPropertyOptional({ example: 'localhost' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  backendUrl?: string;

  @ApiPropertyOptional({ example: 4002 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  backendPort?: number;
}
