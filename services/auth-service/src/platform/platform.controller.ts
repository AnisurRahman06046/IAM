import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { PlatformService } from './platform.service';

@ApiTags('Platform')
@ApiBearerAuth()
@Controller('api/platform')
@Roles('platform_admin')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get platform statistics' })
  getStats() {
    return this.platformService.getStats();
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Query audit logs with filters' })
  getAuditLogs(
    @Query('tenantId') tenantId?: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.platformService.getAuditLogs({
      tenantId,
      actorId,
      action,
      resourceType,
      from,
      to,
      page,
      limit,
    });
  }

  @Get('users')
  @ApiOperation({ summary: 'Cross-tenant user search' })
  searchUsers(
    @Query('q') query: string,
    @Query('first') first?: number,
    @Query('max') max?: number,
  ) {
    return this.platformService.searchUsers(query || '', { first, max: max || 20 });
  }
}
