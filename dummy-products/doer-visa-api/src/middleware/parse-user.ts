import type { Request, Response, NextFunction } from "express";
import type { RequestUser } from "../types.js";

/**
 * Reads user identity from APISIX-injected headers.
 * APISIX validates the JWT and sets:
 *   X-User-Id, X-User-Email, X-User-Roles, X-Client-Roles, X-Organization-Id
 * This middleware populates req.user from those headers.
 */
export function parseUser(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.headers["x-user-id"] as string | undefined;

  if (userId) {
    const user: RequestUser = {
      id: userId,
      email: (req.headers["x-user-email"] as string) || "",
      realmRoles: splitHeader(req.headers["x-user-roles"] as string),
      clientRoles: splitHeader(req.headers["x-client-roles"] as string),
      organizationId: (req.headers["x-organization-id"] as string) || undefined,
    };
    req.user = user;
  }

  next();
}

function splitHeader(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
