import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ForbiddenException, UnauthorizedException } from '../exceptions/domain-exceptions';
import { RequestUser } from '../interfaces/jwt-payload.interface';
import { Tenant } from '../../database/entities/tenant.entity';

@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user: RequestUser = request.user;

    if (!user) {
      throw new UnauthorizedException();
    }

    // platform_admin bypasses tenant scope
    if (user.realmRoles.includes('platform_admin')) {
      return true;
    }

    const tenantId = request.params.tid || request.params.id;
    if (!tenantId) return true;

    // Look up tenant and compare alias against JWT organization claim
    const tenant = await this.tenantRepo.findOneBy({ id: tenantId });
    if (!tenant) {
      throw new ForbiddenException('You do not have access to this tenant');
    }

    if (user.organizationId !== tenant.alias) {
      throw new ForbiddenException(
        'You do not have access to this tenant',
      );
    }

    return true;
  }
}
