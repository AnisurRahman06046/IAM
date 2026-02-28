import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import {
  ConflictException,
  ExternalServiceException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '../common/exceptions/domain-exceptions';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

@Injectable()
export class KeycloakAdminService implements OnModuleInit {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.baseUrl = this.config.get<string>('keycloak.baseUrl')!;
    this.realm = this.config.get<string>('keycloak.realm')!;
    this.clientId = this.config.get<string>('keycloak.clientId')!;
    this.clientSecret = this.config.get<string>('keycloak.clientSecret')!;
  }

  async onModuleInit() {
    await this.refreshServiceAccountToken();
  }

  // ─── Token Management ───────────────────────────────────────

  private async refreshServiceAccountToken(): Promise<void> {
    try {
      const { data } = await firstValueFrom(
        this.http.post<TokenResponse>(
          `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`,
          new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.clientId,
            client_secret: this.clientSecret,
          }).toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        ),
      );

      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + (data.expires_in - 30) * 1000;
      this.logger.log('Service account token obtained');
    } catch (err) {
      this.logger.error('Failed to obtain service account token', (err as Error).message);
      throw new ExternalServiceException('Keycloak', 'Failed to obtain service account token');
    }
  }

  private async getToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      await this.refreshServiceAccountToken();
    }
    return this.accessToken!;
  }

  private async adminHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return { Authorization: `Bearer ${token}` };
  }

  private get adminUrl(): string {
    return `${this.baseUrl}/admin/realms/${this.realm}`;
  }

  // ─── Error Mapping ──────────────────────────────────────────

  private mapError(err: AxiosError, context: string): never {
    const status = err.response?.status;
    const detail =
      (err.response?.data as Record<string, string>)?.errorMessage ||
      (err.response?.data as Record<string, string>)?.error ||
      err.message;

    switch (status) {
      case 404:
        throw new NotFoundException(context);
      case 409:
        throw new ConflictException(detail || `${context} already exists`);
      case 401:
        throw new UnauthorizedException(detail);
      case 403:
        throw new ForbiddenException(detail);
      default:
        throw new ExternalServiceException('Keycloak', `${context}: ${detail}`);
    }
  }

  // ─── User Operations ───────────────────────────────────────

  async createUser(data: {
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    enabled?: boolean;
    emailVerified?: boolean;
    credentials?: { type: string; value: string; temporary?: boolean }[];
    attributes?: Record<string, string[]>;
  }): Promise<string> {
    try {
      const headers = await this.adminHeaders();
      const res = await firstValueFrom(
        this.http.post(`${this.adminUrl}/users`, { enabled: true, ...data }, { headers }),
      );
      const location = res.headers['location'] as string;
      return location.split('/').pop()!;
    } catch (err) {
      this.mapError(err as AxiosError, 'User');
    }
  }

  async getUserById(id: string): Promise<Record<string, unknown>> {
    try {
      const headers = await this.adminHeaders();
      const { data } = await firstValueFrom(
        this.http.get(`${this.adminUrl}/users/${id}`, { headers }),
      );
      return data;
    } catch (err) {
      this.mapError(err as AxiosError, 'User');
    }
  }

  async searchUsers(query: string, params?: { first?: number; max?: number }): Promise<Record<string, unknown>[]> {
    try {
      const headers = await this.adminHeaders();
      const { data } = await firstValueFrom(
        this.http.get(`${this.adminUrl}/users`, {
          headers,
          params: { search: query, ...params },
        }),
      );
      return data;
    } catch (err) {
      this.mapError(err as AxiosError, 'Users search');
    }
  }

  async getUserByEmail(email: string): Promise<Record<string, unknown> | null> {
    try {
      const headers = await this.adminHeaders();
      const { data } = await firstValueFrom(
        this.http.get(`${this.adminUrl}/users`, {
          headers,
          params: { email, exact: true },
        }),
      );
      return data.length > 0 ? data[0] : null;
    } catch (err) {
      this.mapError(err as AxiosError, 'User lookup');
    }
  }

  async updateUser(id: string, data: Record<string, unknown>): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.put(`${this.adminUrl}/users/${id}`, data, { headers }),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'User update');
    }
  }

  async enableUser(id: string): Promise<void> {
    await this.updateUser(id, { enabled: true });
  }

  async disableUser(id: string): Promise<void> {
    await this.updateUser(id, { enabled: false });
  }

  async resetPassword(id: string, password: string, temporary = false): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.put(
          `${this.adminUrl}/users/${id}/reset-password`,
          { type: 'password', value: password, temporary },
          { headers },
        ),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Password reset');
    }
  }

  async logoutUser(id: string): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.post(`${this.adminUrl}/users/${id}/logout`, {}, { headers }),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'User logout');
    }
  }

  async sendActionsEmail(id: string, actions: string[]): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.put(
          `${this.adminUrl}/users/${id}/execute-actions-email`,
          actions,
          { headers },
        ),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Actions email');
    }
  }

  // ─── Role Operations ───────────────────────────────────────

  async assignRealmRoles(userId: string, roleNames: string[]): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      const roles = await this.getRealmRolesByNames(roleNames);
      await firstValueFrom(
        this.http.post(
          `${this.adminUrl}/users/${userId}/role-mappings/realm`,
          roles,
          { headers },
        ),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Realm role assignment');
    }
  }

  async getRealmRolesByNames(names: string[]): Promise<{ id: string; name: string }[]> {
    const headers = await this.adminHeaders();
    const roles: { id: string; name: string }[] = [];
    for (const name of names) {
      try {
        const { data } = await firstValueFrom(
          this.http.get(`${this.adminUrl}/roles/${name}`, { headers }),
        );
        roles.push({ id: data.id, name: data.name });
      } catch (err) {
        this.mapError(err as AxiosError, `Realm role '${name}'`);
      }
    }
    return roles;
  }

  async getClientUuid(clientId: string): Promise<string> {
    try {
      const headers = await this.adminHeaders();
      const { data } = await firstValueFrom(
        this.http.get(`${this.adminUrl}/clients`, {
          headers,
          params: { clientId },
        }),
      );
      if (!data.length) throw new NotFoundException('Client', clientId);
      return data[0].id;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.mapError(err as AxiosError, 'Client lookup');
    }
  }

  async assignClientRoles(
    userId: string,
    clientUuid: string,
    roleNames: string[],
  ): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      const roles = await this.getClientRolesByNames(clientUuid, roleNames);
      await firstValueFrom(
        this.http.post(
          `${this.adminUrl}/users/${userId}/role-mappings/clients/${clientUuid}`,
          roles,
          { headers },
        ),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Client role assignment');
    }
  }

  async removeClientRoles(
    userId: string,
    clientUuid: string,
    roleNames: string[],
  ): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      const roles = await this.getClientRolesByNames(clientUuid, roleNames);
      await firstValueFrom(
        this.http.delete(
          `${this.adminUrl}/users/${userId}/role-mappings/clients/${clientUuid}`,
          { headers, data: roles },
        ),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Client role removal');
    }
  }

  async getUserClientRoles(
    userId: string,
    clientUuid: string,
  ): Promise<{ id: string; name: string }[]> {
    try {
      const headers = await this.adminHeaders();
      const { data } = await firstValueFrom(
        this.http.get(
          `${this.adminUrl}/users/${userId}/role-mappings/clients/${clientUuid}`,
          { headers },
        ),
      );
      return data;
    } catch (err) {
      this.mapError(err as AxiosError, 'User client roles');
    }
  }

  async getClientRoles(clientUuid: string): Promise<{ id: string; name: string; description?: string; composite?: boolean }[]> {
    try {
      const headers = await this.adminHeaders();
      const { data } = await firstValueFrom(
        this.http.get(`${this.adminUrl}/clients/${clientUuid}/roles`, { headers }),
      );
      return data;
    } catch (err) {
      this.mapError(err as AxiosError, 'Client roles');
    }
  }

  private async getClientRolesByNames(
    clientUuid: string,
    names: string[],
  ): Promise<{ id: string; name: string }[]> {
    const headers = await this.adminHeaders();
    const roles: { id: string; name: string }[] = [];
    for (const name of names) {
      try {
        const { data } = await firstValueFrom(
          this.http.get(
            `${this.adminUrl}/clients/${clientUuid}/roles/${name}`,
            { headers },
          ),
        );
        roles.push({ id: data.id, name: data.name });
      } catch (err) {
        this.mapError(err as AxiosError, `Client role '${name}'`);
      }
    }
    return roles;
  }

  // ─── Organization Operations ───────────────────────────────

  async createOrganization(data: {
    name: string;
    alias?: string;
    attributes?: Record<string, string[]>;
  }): Promise<string> {
    try {
      const headers = await this.adminHeaders();
      const res = await firstValueFrom(
        this.http.post(`${this.adminUrl}/organizations`, data, { headers }),
      );
      const location = res.headers['location'] as string;
      return location.split('/').pop()!;
    } catch (err) {
      this.mapError(err as AxiosError, 'Organization');
    }
  }

  async searchOrganizations(search: string): Promise<Record<string, unknown>[]> {
    try {
      const headers = await this.adminHeaders();
      const { data } = await firstValueFrom(
        this.http.get(`${this.adminUrl}/organizations`, {
          headers,
          params: { search },
        }),
      );
      return data;
    } catch (err) {
      this.mapError(err as AxiosError, 'Organization search');
    }
  }

  async deleteOrganization(orgId: string): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.delete(`${this.adminUrl}/organizations/${orgId}`, { headers }),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Organization delete');
    }
  }

  async getOrganization(orgId: string): Promise<Record<string, unknown>> {
    try {
      const headers = await this.adminHeaders();
      const { data } = await firstValueFrom(
        this.http.get(`${this.adminUrl}/organizations/${orgId}`, { headers }),
      );
      return data;
    } catch (err) {
      this.mapError(err as AxiosError, 'Organization');
    }
  }

  async updateOrganization(orgId: string, data: Record<string, unknown>): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.put(`${this.adminUrl}/organizations/${orgId}`, data, { headers }),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Organization update');
    }
  }

  async addMember(orgId: string, userId: string): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.post(
          `${this.adminUrl}/organizations/${orgId}/members`,
          JSON.stringify(userId),
          { headers: { ...headers, 'Content-Type': 'application/json' } },
        ),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Organization member add');
    }
  }

  async removeMember(orgId: string, userId: string): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.delete(
          `${this.adminUrl}/organizations/${orgId}/members/${userId}`,
          { headers },
        ),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Organization member remove');
    }
  }

  async listMembers(
    orgId: string,
    params?: { first?: number; max?: number },
  ): Promise<Record<string, unknown>[]> {
    try {
      const headers = await this.adminHeaders();
      const { data } = await firstValueFrom(
        this.http.get(`${this.adminUrl}/organizations/${orgId}/members`, {
          headers,
          params,
        }),
      );
      return data;
    } catch (err) {
      this.mapError(err as AxiosError, 'Organization members');
    }
  }

  async countMembers(orgId: string): Promise<number> {
    const members = await this.listMembers(orgId, { first: 0, max: 1 });
    // Keycloak doesn't have a direct count endpoint for org members.
    // For accuracy, we fetch all — optimize later with a caching layer.
    const all = await this.listMembers(orgId, { first: 0, max: 10000 });
    return all.length;
  }

  // ─── Client CRUD Operations ───────────────────────────────

  async createClient(data: Record<string, unknown>): Promise<string> {
    try {
      const headers = await this.adminHeaders();
      const res = await firstValueFrom(
        this.http.post(`${this.adminUrl}/clients`, data, { headers }),
      );
      const location = res.headers['location'] as string;
      return location.split('/').pop()!;
    } catch (err) {
      this.mapError(err as AxiosError, 'Client creation');
    }
  }

  async getClient(clientUuid: string): Promise<Record<string, unknown>> {
    try {
      const headers = await this.adminHeaders();
      const { data } = await firstValueFrom(
        this.http.get(`${this.adminUrl}/clients/${clientUuid}`, { headers }),
      );
      return data;
    } catch (err) {
      this.mapError(err as AxiosError, 'Client');
    }
  }

  async updateClient(clientUuid: string, data: Record<string, unknown>): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.put(`${this.adminUrl}/clients/${clientUuid}`, data, { headers }),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Client update');
    }
  }

  async deleteClient(clientUuid: string): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.delete(`${this.adminUrl}/clients/${clientUuid}`, { headers }),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Client deletion');
    }
  }

  async getClientSecret(clientUuid: string): Promise<string> {
    try {
      const headers = await this.adminHeaders();
      const { data } = await firstValueFrom(
        this.http.get(`${this.adminUrl}/clients/${clientUuid}/client-secret`, { headers }),
      );
      return data.value;
    } catch (err) {
      this.mapError(err as AxiosError, 'Client secret');
    }
  }

  // ─── Client Role CRUD ────────────────────────────────────

  async createClientRole(
    clientUuid: string,
    role: { name: string; description?: string; composite?: boolean },
  ): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.post(`${this.adminUrl}/clients/${clientUuid}/roles`, role, { headers }),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Client role creation');
    }
  }

  async deleteClientRole(clientUuid: string, roleName: string): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.delete(`${this.adminUrl}/clients/${clientUuid}/roles/${roleName}`, { headers }),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Client role deletion');
    }
  }

  async addCompositeRoles(
    clientUuid: string,
    roleName: string,
    composites: { id: string; name: string }[],
  ): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.post(
          `${this.adminUrl}/clients/${clientUuid}/roles/${roleName}/composites`,
          composites,
          { headers },
        ),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Composite role assignment');
    }
  }

  async getCompositeRoles(
    clientUuid: string,
    roleName: string,
  ): Promise<{ id: string; name: string }[]> {
    try {
      const headers = await this.adminHeaders();
      const { data } = await firstValueFrom(
        this.http.get(
          `${this.adminUrl}/clients/${clientUuid}/roles/${roleName}/composites`,
          { headers },
        ),
      );
      return data;
    } catch (err) {
      this.mapError(err as AxiosError, 'Composite roles');
    }
  }

  // ─── Scope Mappings ──────────────────────────────────────

  async addRealmRoleScopeMappings(
    clientUuid: string,
    roles: { id: string; name: string }[],
  ): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.post(
          `${this.adminUrl}/clients/${clientUuid}/scope-mappings/realm`,
          roles,
          { headers },
        ),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Realm role scope mapping');
    }
  }

  async addClientRoleScopeMappings(
    clientUuid: string,
    targetClientUuid: string,
    roles: { id: string; name: string }[],
  ): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.post(
          `${this.adminUrl}/clients/${clientUuid}/scope-mappings/clients/${targetClientUuid}`,
          roles,
          { headers },
        ),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Client role scope mapping');
    }
  }

  // ─── Client Scopes ───────────────────────────────────────

  async getClientScopes(): Promise<{ id: string; name: string }[]> {
    try {
      const headers = await this.adminHeaders();
      const { data } = await firstValueFrom(
        this.http.get(`${this.adminUrl}/client-scopes`, { headers }),
      );
      return data;
    } catch (err) {
      this.mapError(err as AxiosError, 'Client scopes');
    }
  }

  async addDefaultClientScope(clientUuid: string, scopeId: string): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.put(
          `${this.adminUrl}/clients/${clientUuid}/default-client-scopes/${scopeId}`,
          {},
          { headers },
        ),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Default client scope');
    }
  }

  async removeOptionalClientScope(clientUuid: string, scopeId: string): Promise<void> {
    try {
      const headers = await this.adminHeaders();
      await firstValueFrom(
        this.http.delete(
          `${this.adminUrl}/clients/${clientUuid}/optional-client-scopes/${scopeId}`,
          { headers },
        ),
      );
    } catch (err) {
      // Ignore 404 — scope may not be in optional list
      if ((err as AxiosError).response?.status === 404) return;
      this.mapError(err as AxiosError, 'Remove optional client scope');
    }
  }

  // ─── Realm Roles (List) ──────────────────────────────────

  async getRealmRoles(): Promise<{ id: string; name: string }[]> {
    try {
      const headers = await this.adminHeaders();
      const { data } = await firstValueFrom(
        this.http.get(`${this.adminUrl}/roles`, { headers }),
      );
      return data;
    } catch (err) {
      this.mapError(err as AxiosError, 'Realm roles');
    }
  }

  // ─── Token Operations (Public Client Flows) ────────────────

  async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
    redirectUri: string,
    clientId: string,
  ): Promise<Record<string, unknown>> {
    try {
      const { data } = await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`,
          new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            code_verifier: codeVerifier,
            redirect_uri: redirectUri,
            client_id: clientId,
          }).toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        ),
      );
      return data;
    } catch (err) {
      this.mapError(err as AxiosError, 'Token exchange');
    }
  }

  async refreshToken(
    refreshToken: string,
    clientId: string,
  ): Promise<Record<string, unknown>> {
    try {
      const { data } = await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`,
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
          }).toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        ),
      );
      return data;
    } catch (err) {
      this.mapError(err as AxiosError, 'Token refresh');
    }
  }

  async revokeToken(refreshToken: string, clientId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/revoke`,
          new URLSearchParams({
            token: refreshToken,
            token_type_hint: 'refresh_token',
            client_id: clientId,
          }).toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        ),
      );
    } catch (err) {
      this.mapError(err as AxiosError, 'Token revocation');
    }
  }
}
