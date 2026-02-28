import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateRolesDto } from './dto/update-roles.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('api/tenants/:tid/users')
@UseGuards(TenantScopeGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles('platform_admin', 'tenant_admin')
  @ApiOperation({ summary: 'Create a user within the tenant' })
  create(
    @Param('tid') tid: string,
    @Body() dto: CreateUserDto,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    return this.usersService.createUser(tid, dto, user, ip);
  }

  @Get()
  @ApiOperation({ summary: 'List users in tenant' })
  findAll(
    @Param('tid') tid: string,
    @Query('first') first?: number,
    @Query('max') max?: number,
  ) {
    return this.usersService.listUsers(tid, { first, max: max || 20 });
  }

  @Get(':uid')
  @ApiOperation({ summary: 'Get user details with roles' })
  findOne(@Param('tid') tid: string, @Param('uid') uid: string) {
    return this.usersService.getUser(tid, uid);
  }

  @Put(':uid/roles')
  @Roles('platform_admin', 'tenant_admin')
  @ApiOperation({ summary: 'Update user roles' })
  updateRoles(
    @Param('tid') tid: string,
    @Param('uid') uid: string,
    @Body() dto: UpdateRolesDto,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    return this.usersService.updateRoles(tid, uid, dto, user, ip);
  }

  @Put(':uid/disable')
  @Roles('platform_admin', 'tenant_admin')
  @ApiOperation({ summary: 'Disable a user' })
  disable(
    @Param('tid') tid: string,
    @Param('uid') uid: string,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    return this.usersService.disableUser(tid, uid, user, ip);
  }

  @Put(':uid/enable')
  @Roles('platform_admin', 'tenant_admin')
  @ApiOperation({ summary: 'Enable a user' })
  enable(
    @Param('tid') tid: string,
    @Param('uid') uid: string,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    return this.usersService.enableUser(tid, uid, user, ip);
  }

  @Delete(':uid')
  @Roles('platform_admin', 'tenant_admin')
  @ApiOperation({ summary: 'Remove user from tenant' })
  remove(
    @Param('tid') tid: string,
    @Param('uid') uid: string,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    return this.usersService.removeUser(tid, uid, user, ip);
  }

  @Post('invite')
  @Roles('platform_admin', 'tenant_admin')
  @ApiOperation({ summary: 'Send invitation to join tenant' })
  invite(
    @Param('tid') tid: string,
    @Body() dto: CreateInvitationDto,
    @CurrentUser() user: RequestUser,
    @Ip() ip: string,
  ) {
    return this.usersService.createInvitation(tid, dto, user, ip);
  }

  @Get('roles/available')
  @ApiOperation({ summary: 'List available client roles for tenant product' })
  getAvailableRoles(@Param('tid') tid: string) {
    return this.usersService.getAvailableRoles(tid);
  }
}
