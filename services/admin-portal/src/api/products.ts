import { apiCall } from "./client";

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  frontendUrl: string | null;
  backendUrl: string | null;
  backendPort: number | null;
  kcPublicClientId: string | null;
  kcBackendClientId: string | null;
  kcBackendClientSecret: string | null;
  apisixRouteId: string | null;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductPayload {
  name: string;
  slug: string;
  description?: string;
  frontendUrl?: string;
  backendUrl?: string;
  backendPort?: number;
  permissions?: { name: string; description?: string }[];
  roles?: { name: string; description?: string; permissions: string[] }[];
  defaultRole?: string;
}

export interface UpdateProductPayload {
  name?: string;
  description?: string;
  frontendUrl?: string;
  backendUrl?: string;
  backendPort?: number;
}

export interface ClientRole {
  id: string;
  name: string;
  description?: string;
  composite?: boolean;
}

export const productsApi = {
  list: () => apiCall<Product[]>("/api/admin/products"),
  get: (id: string) => apiCall<Product>(`/api/admin/products/${id}`),
  create: (data: CreateProductPayload) =>
    apiCall<Product>("/api/admin/products", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateProductPayload) =>
    apiCall<Product>(`/api/admin/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deactivate: (id: string) =>
    apiCall<Product>(`/api/admin/products/${id}`, { method: "DELETE" }),

  // Roles
  getRoles: (id: string) => apiCall<ClientRole[]>(`/api/admin/products/${id}/roles`),
  createRole: (id: string, data: { name: string; description?: string; composite?: boolean }) =>
    apiCall<void>(`/api/admin/products/${id}/roles`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteRole: (id: string, roleName: string) =>
    apiCall<void>(`/api/admin/products/${id}/roles/${roleName}`, { method: "DELETE" }),
  getComposites: (id: string, roleName: string) =>
    apiCall<ClientRole[]>(`/api/admin/products/${id}/roles/${roleName}/composites`),
  addComposites: (id: string, roleName: string, roleNames: string[]) =>
    apiCall<void>(`/api/admin/products/${id}/roles/${roleName}/composites`, {
      method: "POST",
      body: JSON.stringify({ roleNames }),
    }),

  // Route
  getRoute: (id: string) => apiCall<Record<string, unknown> | null>(`/api/admin/products/${id}/route`),
  updateRoute: (id: string, data: Record<string, unknown>) =>
    apiCall<void>(`/api/admin/products/${id}/route`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  toggleRoute: (id: string) =>
    apiCall<{ enabled: boolean }>(`/api/admin/products/${id}/route/toggle`, { method: "POST" }),

  // Tenants
  getTenants: (id: string) => apiCall<Tenant[]>(`/api/admin/products/${id}/tenants`),
};

export interface Tenant {
  id: string;
  name: string;
  alias: string;
  product: string;
  plan: string;
  maxUsers: number;
  status: string;
  createdAt: string;
}
