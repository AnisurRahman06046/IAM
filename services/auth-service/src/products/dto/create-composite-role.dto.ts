import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCompositeRoleDto {
  @ApiProperty({ example: ['view_students', 'view_own_status'], description: 'Role names to add as composites' })
  @IsArray()
  @IsString({ each: true })
  roleNames: string[];
}
