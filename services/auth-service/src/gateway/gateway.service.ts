import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { ExternalServiceException } from '../common/exceptions/domain-exceptions';
import { ApisixRouteConfig } from './interfaces/apisix-route.interface';

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);
  private readonly adminUrl: string;
  private readonly adminKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.adminUrl = this.config.get<string>('apisix.adminUrl')!;
    this.adminKey = this.config.get<string>('apisix.adminKey')!;
  }

  private get headers(): Record<string, string> {
    return {
      'X-API-KEY': this.adminKey,
      'Content-Type': 'application/json',
    };
  }

  async upsertRoute(routeId: string, config: ApisixRouteConfig): Promise<void> {
    try {
      await firstValueFrom(
        this.http.put(
          `${this.adminUrl}/apisix/admin/routes/${routeId}`,
          config,
          { headers: this.headers },
        ),
      );
      this.logger.log(`Route ${routeId} upserted: ${config.name}`);
    } catch (err) {
      const detail = (err as AxiosError).response?.data;
      this.logger.error(`Failed to upsert route ${routeId}`, detail);
      throw new ExternalServiceException('APISIX', `Route upsert failed: ${JSON.stringify(detail)}`);
    }
  }

  async getRoute(routeId: string): Promise<Record<string, unknown> | null> {
    try {
      const { data } = await firstValueFrom(
        this.http.get(`${this.adminUrl}/apisix/admin/routes/${routeId}`, {
          headers: this.headers,
        }),
      );
      return data.value || data;
    } catch (err) {
      if ((err as AxiosError).response?.status === 404) return null;
      throw new ExternalServiceException('APISIX', 'Failed to get route');
    }
  }

  async listRoutes(): Promise<Record<string, unknown>[]> {
    try {
      const { data } = await firstValueFrom(
        this.http.get(`${this.adminUrl}/apisix/admin/routes`, {
          headers: this.headers,
        }),
      );
      return (data.list || []).map((r: Record<string, unknown>) => r.value || r);
    } catch (err) {
      throw new ExternalServiceException('APISIX', 'Failed to list routes');
    }
  }

  async deleteRoute(routeId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete(`${this.adminUrl}/apisix/admin/routes/${routeId}`, {
          headers: this.headers,
        }),
      );
      this.logger.log(`Route ${routeId} deleted`);
    } catch (err) {
      if ((err as AxiosError).response?.status === 404) return;
      throw new ExternalServiceException('APISIX', 'Failed to delete route');
    }
  }

  async setRouteStatus(routeId: string, enabled: boolean): Promise<void> {
    try {
      await firstValueFrom(
        this.http.patch(
          `${this.adminUrl}/apisix/admin/routes/${routeId}`,
          { status: enabled ? 1 : 0 },
          { headers: this.headers },
        ),
      );
      this.logger.log(`Route ${routeId} ${enabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      throw new ExternalServiceException('APISIX', 'Failed to update route status');
    }
  }

  buildProductRouteConfig(params: {
    slug: string;
    backendHost: string;
    backendPort: number;
    kcDiscovery: string;
    oidcClientId: string;
    oidcClientSecret: string;
  }): ApisixRouteConfig {
    const { slug, backendHost, backendPort, kcDiscovery, oidcClientId, oidcClientSecret } = params;

    // Lua function to parse X-Userinfo and inject individual headers
    const luaFn = `return function(conf, ctx) local core = require("apisix.core"); local hdr = core.request.header(ctx, "X-Userinfo"); if not hdr then return end; local json_str = ngx.decode_base64(hdr); if not json_str then return end; local payload = require("cjson.safe").decode(json_str); if not payload then return end; if payload.sub then core.request.set_header(ctx, "X-User-Id", payload.sub) end; if payload.email then core.request.set_header(ctx, "X-User-Email", payload.email) end; if payload.realm_access and payload.realm_access.roles then core.request.set_header(ctx, "X-User-Roles", table.concat(payload.realm_access.roles, ",")) end; local ra = payload.resource_access; if ra and ra["${slug}"] and ra["${slug}"].roles then core.request.set_header(ctx, "X-Client-Roles", table.concat(ra["${slug}"].roles, ",")) end; if payload.organization then local org = payload.organization; if type(org) == "table" then if org[1] then core.request.set_header(ctx, "X-Organization-Id", org[1]) else for k, _ in pairs(org) do core.request.set_header(ctx, "X-Organization-Id", k); break end end end end; core.request.set_header(ctx, "X-Userinfo", nil) end`;

    return {
      name: `${slug}-api`,
      desc: `${slug} product API — JWT validated, claims injected as headers`,
      uris: [`/api/${slug.replace('doer-', '')}`, `/api/${slug.replace('doer-', '')}/*`],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      upstream: {
        type: 'roundrobin',
        nodes: { [`${backendHost}:${backendPort}`]: 1 },
        timeout: { connect: 5, send: 10, read: 10 },
      },
      plugins: {
        'openid-connect': {
          discovery: kcDiscovery,
          client_id: oidcClientId,
          client_secret: oidcClientSecret,
          bearer_only: true,
          realm: 'doer',
          token_signing_alg_values_expected: 'RS256',
          set_userinfo_header: true,
          set_access_token_header: false,
        },
        'serverless-pre-function': {
          phase: 'before_proxy',
          functions: [luaFn],
        },
        'limit-count': {
          count: 1000,
          time_window: 60,
          key_type: 'var',
          key: 'remote_addr',
          rejected_code: 429,
          policy: 'local',
        },
        cors: {
          allow_origins: '**',
          allow_methods: 'GET,POST,PUT,DELETE,OPTIONS',
          allow_headers: 'Content-Type,Authorization,X-Request-Id',
          expose_headers: 'X-Request-Id',
          max_age: 3600,
          allow_credential: false,
        },
      },
    };
  }
}
