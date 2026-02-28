import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Ip,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces/jwt-payload.interface';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateClientRoleDto } from './dto/create-client-role.dto';
import { CreateCompositeRoleDto } from './dto/create-composite-role.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { ProductResponseDto } from './dto/product-response.dto';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('api/admin/products')
@Roles('platform_admin')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Create product (full onboarding orchestration)' })
  async create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    // SECURITY: Strip secrets from response
    const product = await this.productsService.create(dto, user, ip);
    return ProductResponseDto.from(product);
  }

  @Get()
  @ApiOperation({ summary: 'List all products' })
  async findAll() {
    const products = await this.productsService.findAll();
    return ProductResponseDto.fromMany(products);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product detail' })
  async findOne(@Param('id') id: string) {
    const product = await this.productsService.findOne(id);
    return ProductResponseDto.from(product);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update product metadata' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    const product = await this.productsService.update(id, dto, user, ip);
    return ProductResponseDto.from(product);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate product' })
  async deactivate(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    const product = await this.productsService.deactivate(id, user, ip);
    return ProductResponseDto.from(product);
  }

  // ─── Client Roles ───────────────────────────────────────

  @Get(':id/roles')
  @ApiOperation({ summary: 'List client roles for product' })
  getRoles(@Param('id') id: string) {
    return this.productsService.getRoles(id);
  }

  @Post(':id/roles')
  @ApiOperation({ summary: 'Create a client role' })
  createRole(
    @Param('id') id: string,
    @Body() dto: CreateClientRoleDto,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    return this.productsService.createRole(id, dto, user, ip);
  }

  @Delete(':id/roles/:roleName')
  @ApiOperation({ summary: 'Delete a client role' })
  deleteRole(
    @Param('id') id: string,
    @Param('roleName') roleName: string,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    return this.productsService.deleteRole(id, roleName, user, ip);
  }

  @Post(':id/roles/:roleName/composites')
  @ApiOperation({ summary: 'Add composite roles' })
  addComposites(
    @Param('id') id: string,
    @Param('roleName') roleName: string,
    @Body() dto: CreateCompositeRoleDto,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    return this.productsService.addComposites(id, roleName, dto.roleNames, user, ip);
  }

  @Get(':id/roles/:roleName/composites')
  @ApiOperation({ summary: 'Get composite roles' })
  getComposites(
    @Param('id') id: string,
    @Param('roleName') roleName: string,
  ) {
    return this.productsService.getComposites(id, roleName);
  }

  // ─── Route Config ───────────────────────────────────────

  @Get(':id/route')
  @ApiOperation({ summary: 'Get APISIX route config' })
  getRoute(@Param('id') id: string) {
    return this.productsService.getRoute(id);
  }

  @Put(':id/route')
  @ApiOperation({ summary: 'Update APISIX route config' })
  updateRoute(
    @Param('id') id: string,
    @Body() dto: UpdateRouteDto,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    return this.productsService.updateRoute(id, dto as unknown as Record<string, unknown>, user, ip);
  }

  @Post(':id/route/toggle')
  @ApiOperation({ summary: 'Enable/disable APISIX route' })
  toggleRoute(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    return this.productsService.toggleRoute(id, user, ip);
  }

  // ─── Tenants ────────────────────────────────────────────

  @Get(':id/tenants')
  @ApiOperation({ summary: 'List tenants for this product' })
  getProductTenants(@Param('id') id: string) {
    return this.productsService.getProductTenants(id);
  }
}
