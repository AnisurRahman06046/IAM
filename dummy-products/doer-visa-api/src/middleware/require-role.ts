import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

/**
 * Require that the user has at least one of the specified doer-visa client roles.
 * Roles come from the X-Client-Roles header (set by APISIX).
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const hasRole = roles.some((role) => req.user!.clientRoles.includes(role));
    if (!hasRole) {
      res.status(403).json({
        error: "Insufficient permissions",
        required: roles,
        actual: req.user.clientRoles,
      });
      return;
    }
    next();
  };
}
