import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'My Product v2' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated product description' })
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
