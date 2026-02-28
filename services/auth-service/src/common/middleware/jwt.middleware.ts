import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtPayload, RequestUser } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtMiddleware implements NestMiddleware {
  private readonly logger = new Logger(JwtMiddleware.name);

  use(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    try {
      const payload = this.decodeJwt(token);
      if (!payload || !payload.sub) {
        return next();
      }

      // organization claim can be an array of aliases (e.g. ["e2e-test-corp"])
      // or a map (e.g. {"e2e-test-corp": {}})
      const orgKeys = payload.organization
        ? Array.isArray(payload.organization)
          ? payload.organization
          : Object.keys(payload.organization)
        : [];

      const clientRoles: Record<string, string[]> = {};
      if (payload.resource_access) {
        for (const [client, access] of Object.entries(payload.resource_access)) {
          clientRoles[client] = access.roles || [];
        }
      }

      const user: RequestUser = {
        id: payload.sub,
        email: payload.email,
        username: payload.preferred_username,
        firstName: payload.given_name,
        lastName: payload.family_name,
        realmRoles: payload.realm_access?.roles || [],
        clientRoles,
        organizationId: orgKeys.length > 0 ? orgKeys[0] : undefined,
      };

      (req as unknown as Record<string, unknown>).user = user;
    } catch (err) {
      this.logger.warn('Failed to decode JWT', (err as Error).message);
    }

    next();
  }

  private decodeJwt(token: string): JwtPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
      return JSON.parse(payload) as JwtPayload;
    } catch {
      return null;
    }
  }
}
