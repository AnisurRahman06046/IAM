import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLIENT_ROLES_KEY } from '../decorators/client-roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UnauthorizedException, ForbiddenException } from '../exceptions/domain-exceptions';
import { RequestUser } from '../interfaces/jwt-payload.interface';

@Injectable()
export class ClientRolesGuard implements CanActivate {
  private readonly logger = new Logger(ClientRolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredClientRoles = this.reflector.getAllAndOverride<{ client: string; roles: string[] }>(
      CLIENT_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredClientRoles) return true;

    const request = context.switchToHttp().getRequest();
    const user: RequestUser = request.user;

    if (!user) {
      throw new UnauthorizedException();
    }

    // platform_admin bypasses client role checks
    if (user.realmRoles.includes('platform_admin')) {
      return true;
    }

    const { client, roles } = requiredClientRoles;
    const userClientRoles = user.clientRoles[client] || [];
    const hasRole = roles.some((role) => userClientRoles.includes(role));

    if (!hasRole) {
      this.logger.warn(
        `User ${user.id} denied: requires client roles [${roles.join(', ')}] on ${client}`,
      );
      throw new ForbiddenException(
        `Required client roles: ${roles.join(', ')}`,
      );
    }

    return true;
  }
}
