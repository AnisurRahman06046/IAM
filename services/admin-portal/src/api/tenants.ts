import { apiCall } from "./client";

export interface Tenant {
  id: string;
  name: string;
  alias: string;
  product: string;
  plan: string;
  maxUsers: number;
  status: string;
  billingEmail: string | null;
  domain: string | null;
  keycloakOrgId: string;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
}

export const tenantsApi = {
  list: (params?: { page?: number; limit?: number }) => {
    const qs = params
      ? new URLSearchParams(
          Object.entries(params).reduce(
            (acc, [k, v]) => (v != null ? { ...acc, [k]: String(v) } : acc),
            {} as Record<string, string>,
          ),
        ).toString()
      : "";
    return apiCall<{ items: Tenant[]; meta: { total: number } }>(
      `/api/tenants${qs ? `?${qs}` : ""}`,
    );
  },
  get: (id: string) => apiCall<Tenant>(`/api/tenants/${id}`),
};
