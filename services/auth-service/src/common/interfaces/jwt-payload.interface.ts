export interface JwtPayload {
  sub: string;
  email?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: {
    roles: string[];
  };
  resource_access?: Record<string, { roles: string[] }>;
  organization?: Record<string, unknown>;
  iat?: number;
  exp?: number;
  iss?: string;
}

export class RequestUser {
  id: string;
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  realmRoles: string[];
  clientRoles: Record<string, string[]>;
  organizationId?: string;
}
