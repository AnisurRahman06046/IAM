import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { Navbar } from "../components/Navbar";
import { apiCall } from "../api/client";

interface Application {
  id: string;
  destination: string;
  purpose: string;
  status: string;
  userEmail: string;
  createdAt: string;
}

const capabilities = [
  { role: "apply_visa", label: "Create Applications" },
  { role: "view_own_status", label: "View Own Applications" },
  { role: "view_applications", label: "View All Org Applications" },
  { role: "process_visa", label: "Process Applications" },
  { role: "approve_visa", label: "Approve / Reject Applications" },
  { role: "manage_applications", label: "Manage All Applications" },
  { role: "manage_all", label: "Full Access" },
];

const statusColors: Record<string, string> = {
  submitted: "#6b7280",
  processing: "#d97706",
  approved: "#059669",
  rejected: "#dc2626",
};

const s: Record<string, React.CSSProperties> = {
  container: { maxWidth: "900px", margin: "0 auto", padding: "24px" },
  section: {
    background: "white", borderRadius: "8px", padding: "20px",
    marginBottom: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  h2: { fontSize: "16px", fontWeight: 600, marginBottom: "12px", color: "#374151" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px" },
  cap: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "8px 12px", borderRadius: "6px", fontSize: "13px",
  },
  dot: { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0 },
  statsRow: { display: "flex", gap: "12px", flexWrap: "wrap" as const },
  stat: {
    flex: "1", minWidth: "100px", textAlign: "center" as const,
    padding: "16px", borderRadius: "8px", background: "#f9fafb",
  },
  statVal: { fontSize: "28px", fontWeight: 700, color: "#0d9488" },
  statLabel: { fontSize: "12px", color: "#6b7280", marginTop: "4px" },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: "13px" },
  th: { textAlign: "left" as const, padding: "8px 12px", borderBottom: "2px solid #e5e7eb", color: "#6b7280", fontWeight: 600 },
  td: { padding: "8px 12px", borderBottom: "1px solid #f3f4f6" },
  badge: { padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600, color: "white" },
  link: { color: "#0d9488", textDecoration: "none", fontWeight: 500 },
  userInfo: { display: "flex", gap: "16px", flexWrap: "wrap" as const, fontSize: "13px", color: "#374151" },
  label: { fontWeight: 600, color: "#6b7280" },
};

export function DashboardPage() {
  const { user } = useAuth();
  const [apps, setApps] = useState<Application[]>([]);

  const clientRoles = user?.resource_access?.["doer-visa"]?.roles || [];
  const hasRole = (role: string) => clientRoles.includes(role) || clientRoles.includes("manage_all");

  useEffect(() => {
    apiCall<Application[]>("/api/visa/applications").then(setApps).catch(() => {});
  }, []);

  const statusCounts = apps.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const orgId = user?.organization
    ? Array.isArray(user.organization) ? user.organization[0] : Object.keys(user.organization)[0]
    : "none";

  return (
    <>
      <Navbar />
      <div style={s.container}>
        {/* User Info */}
        <div style={s.section}>
          <h2 style={s.h2}>Your Identity</h2>
          <div style={s.userInfo}>
            <span><span style={s.label}>Email: </span>{user?.email}</span>
            <span><span style={s.label}>Organization: </span>{orgId}</span>
            <span><span style={s.label}>Realm Roles: </span>{user?.realm_access?.roles?.join(", ") || "none"}</span>
          </div>
        </div>

        {/* Role Capabilities */}
        <div style={s.section}>
          <h2 style={s.h2}>Your Capabilities</h2>
          <div style={s.grid}>
            {capabilities.map((cap) => {
              const has = hasRole(cap.role);
              return (
                <div key={cap.role} style={{ ...s.cap, background: has ? "#ecfdf5" : "#f9fafb" }}>
                  <span style={{ ...s.dot, background: has ? "#059669" : "#d1d5db" }} />
                  <span style={{ color: has ? "#065f46" : "#9ca3af" }}>{cap.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats */}
        <div style={s.section}>
          <h2 style={s.h2}>Application Stats</h2>
          <div style={s.statsRow}>
            <div style={s.stat}>
              <div style={s.statVal}>{apps.length}</div>
              <div style={s.statLabel}>Total</div>
            </div>
            {["submitted", "processing", "approved", "rejected"].map((status) => (
              <div key={status} style={s.stat}>
                <div style={{ ...s.statVal, color: statusColors[status] }}>{statusCounts[status] || 0}</div>
                <div style={s.statLabel}>{status.charAt(0).toUpperCase() + status.slice(1)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Applications */}
        <div style={s.section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h2 style={{ ...s.h2, marginBottom: 0 }}>Recent Applications</h2>
            <a href="#/applications" style={s.link}>View all &rarr;</a>
          </div>
          {apps.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: "14px" }}>No applications yet. <a href="#/applications" style={s.link}>Create one</a></p>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Destination</th>
                  <th style={s.th}>Purpose</th>
                  <th style={s.th}>Applicant</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Created</th>
                </tr>
              </thead>
              <tbody>
                {apps.slice(0, 5).map((app) => (
                  <tr key={app.id}>
                    <td style={s.td}>{app.destination}</td>
                    <td style={s.td}>{app.purpose}</td>
                    <td style={s.td}>{app.userEmail}</td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: statusColors[app.status] || "#6b7280" }}>
                        {app.status}
                      </span>
                    </td>
                    <td style={s.td}>{new Date(app.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
