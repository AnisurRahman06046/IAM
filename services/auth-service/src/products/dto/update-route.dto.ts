import { IsObject, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRouteDto {
  @ApiPropertyOptional({ description: 'APISIX plugins config override' })
  @IsOptional()
  @IsObject()
  plugins?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'APISIX upstream config override' })
  @IsOptional()
  @IsObject()
  upstream?: Record<string, unknown>;
}
