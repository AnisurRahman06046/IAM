import { apiCall } from "./client";

export interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  totalUsers: number;
  totalProducts: number;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  tenantId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export const platformApi = {
  getStats: () => apiCall<PlatformStats>("/api/platform/stats"),
  getAuditLogs: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return apiCall<{ items: AuditLogEntry[]; total: number }>(
      `/api/platform/audit-logs${qs ? `?${qs}` : ""}`,
    );
  },
};
