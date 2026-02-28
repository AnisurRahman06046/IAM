import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Doer School v2' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Updated school management product' })
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
