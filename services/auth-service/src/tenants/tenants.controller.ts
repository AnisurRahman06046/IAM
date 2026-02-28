import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Ip,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantScopeGuard } from '../common/guards/tenant-scope.guard';
import { RequestUser } from '../common/interfaces/jwt-payload.interface';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@ApiTags('Tenants')
@ApiBearerAuth()
@Controller('api/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @Roles('platform_admin')
  @ApiOperation({ summary: 'Create a new tenant' })
  create(
    @Body() dto: CreateTenantDto,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    return this.tenantsService.create(dto, user, ip);
  }

  @Get()
  @Roles('platform_admin', 'tenant_admin')
  @ApiOperation({ summary: 'List tenants' })
  findAll(@Query() pagination: PaginationDto, @CurrentUser() user: RequestUser) {
    return this.tenantsService.findAll(pagination, user);
  }

  @Get(':id')
  @UseGuards(TenantScopeGuard)
  @ApiOperation({ summary: 'Get tenant details' })
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Put(':id')
  @Roles('platform_admin')
  @ApiOperation({ summary: 'Update tenant' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    return this.tenantsService.update(id, dto, user, ip);
  }

  @Put(':id/activate')
  @Roles('platform_admin')
  @ApiOperation({ summary: 'Activate tenant and enable all members' })
  activate(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    return this.tenantsService.activate(id, user, ip);
  }

  @Put(':id/deactivate')
  @Roles('platform_admin')
  @ApiOperation({ summary: 'Deactivate tenant and disable all members' })
  deactivate(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    return this.tenantsService.deactivate(id, user, ip);
  }
}
