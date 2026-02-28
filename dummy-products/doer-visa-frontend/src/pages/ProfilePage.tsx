import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { Navbar } from "../components/Navbar";
import { apiCall } from "../api/client";

interface BackendIdentity {
  id: string;
  email: string;
  realmRoles: string[];
  clientRoles: string[];
  organizationId: string | null;
}

const s: Record<string, React.CSSProperties> = {
  container: { maxWidth: "900px", margin: "0 auto", padding: "24px" },
  section: {
    background: "white", borderRadius: "8px", padding: "20px",
    marginBottom: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  h2: { fontSize: "16px", fontWeight: 600, marginBottom: "12px", color: "#374151" },
  h3: { fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "#6b7280" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  row: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6", fontSize: "13px" },
  label: { fontWeight: 600, color: "#6b7280" },
  value: { color: "#111827", textAlign: "right" as const, maxWidth: "60%", wordBreak: "break-all" as const },
  roles: { display: "flex", gap: "4px", flexWrap: "wrap" as const, justifyContent: "flex-end" },
  roleBadge: {
    display: "inline-block", padding: "2px 8px", borderRadius: "12px",
    fontSize: "11px", fontWeight: 600, background: "#ecfdf5", color: "#065f46",
  },
  pre: {
    background: "#f9fafb", borderRadius: "6px", padding: "12px",
    fontSize: "12px", fontFamily: "monospace", whiteSpace: "pre-wrap" as const,
    maxHeight: "300px", overflow: "auto", border: "1px solid #e5e7eb",
  },
  expiry: { fontSize: "13px", color: "#374151" },
  warn: { color: "#d97706" },
  ok: { color: "#059669" },
  error: { color: "#dc2626", fontSize: "13px" },
  btn: {
    padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: "6px",
    background: "white", cursor: "pointer", fontSize: "13px",
  },
  match: { padding: "8px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: 500 },
};

export function ProfilePage() {
  const { user, refresh, accessToken } = useAuth();
  const [backend, setBackend] = useState<BackendIdentity | null>(null);
  const [backendError, setBackendError] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    apiCall<BackendIdentity>("/api/visa/me")
      .then(setBackend)
      .catch((e: any) => setBackendError(e.message));
  }, []);

  // Update clock every second for token expiry countdown
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const exp = user?.exp ? (user.exp as number) * 1000 : 0;
  const remaining = exp ? Math.max(0, Math.floor((exp - now) / 1000)) : 0;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const isExpiringSoon = remaining > 0 && remaining < 120;
  const isExpired = exp > 0 && remaining === 0;

  const orgId = user?.organization
    ? Array.isArray(user.organization) ? user.organization[0] : Object.keys(user.organization)[0]
    : null;

  const clientRoles = user?.resource_access?.["doer-visa"]?.roles || [];

  // Check if frontend and backend agree
  const identityMatch = backend && user
    ? backend.id === user.sub && backend.email === user.email && backend.organizationId === orgId
    : null;

  return (
    <>
      <Navbar />
      <div style={s.container}>
        {/* Token Status */}
        <div style={s.section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ ...s.h2, marginBottom: 0 }}>Token Status</h2>
            <button style={s.btn} onClick={() => refresh().then(() => {
              apiCall<BackendIdentity>("/api/visa/me").then(setBackend).catch(() => {});
            })}>
              Refresh Token
            </button>
          </div>
          <div style={{ marginTop: "12px" }}>
            {isExpired ? (
              <p style={{ ...s.expiry, ...s.error }}>Token expired — click Refresh Token</p>
            ) : (
              <p style={{ ...s.expiry, ...(isExpiringSoon ? s.warn : s.ok) }}>
                Expires in {minutes}m {seconds}s
                {isExpiringSoon && " — expiring soon!"}
              </p>
            )}
          </div>
        </div>

        {/* Identity Match Check */}
        {identityMatch !== null && (
          <div style={{
            ...s.match,
            background: identityMatch ? "#ecfdf5" : "#fef2f2",
            color: identityMatch ? "#065f46" : "#991b1b",
            marginBottom: "16px",
          }}>
            {identityMatch
              ? "Frontend JWT and Backend APISIX headers match — the full auth chain is working correctly."
              : "Mismatch detected between Frontend JWT and Backend headers — check APISIX configuration."}
          </div>
        )}

        {/* Side by side comparison */}
        <div style={s.grid}>
          {/* Frontend: JWT Claims */}
          <div style={s.section}>
            <h2 style={s.h2}>Frontend (JWT Decode)</h2>
            <h3 style={s.h3}>What the browser sees from the access token</h3>
            <div style={s.row}><span style={s.label}>User ID</span><span style={s.value}>{user?.sub}</span></div>
            <div style={s.row}><span style={s.label}>Email</span><span style={s.value}>{user?.email}</span></div>
            <div style={s.row}><span style={s.label}>Name</span><span style={s.value}>{user?.given_name} {user?.family_name}</span></div>
            <div style={s.row}><span style={s.label}>Organization</span><span style={s.value}>{orgId || "none"}</span></div>
            <div style={s.row}>
              <span style={s.label}>Realm Roles</span>
              <div style={s.roles}>
                {user?.realm_access?.roles?.map((r) => (
                  <span key={r} style={s.roleBadge}>{r}</span>
                )) || <span style={{ color: "#9ca3af" }}>none</span>}
              </div>
            </div>
            <div style={s.row}>
              <span style={s.label}>Client Roles</span>
              <div style={s.roles}>
                {clientRoles.length > 0 ? clientRoles.map((r) => (
                  <span key={r} style={{ ...s.roleBadge, background: "#dbeafe", color: "#1e40af" }}>{r}</span>
                )) : <span style={{ color: "#9ca3af" }}>none</span>}
              </div>
            </div>
          </div>

          {/* Backend: APISIX Headers */}
          <div style={s.section}>
            <h2 style={s.h2}>Backend (APISIX Headers)</h2>
            <h3 style={s.h3}>What the API sees from X-User-* headers</h3>
            {backendError ? (
              <p style={s.error}>{backendError}</p>
            ) : backend ? (
              <>
                <div style={s.row}><span style={s.label}>X-User-Id</span><span style={s.value}>{backend.id}</span></div>
                <div style={s.row}><span style={s.label}>X-User-Email</span><span style={s.value}>{backend.email}</span></div>
                <div style={s.row}><span style={s.label}>X-Organization-Id</span><span style={s.value}>{backend.organizationId || "none"}</span></div>
                <div style={s.row}>
                  <span style={s.label}>X-User-Roles</span>
                  <div style={s.roles}>
                    {backend.realmRoles.length > 0 ? backend.realmRoles.map((r) => (
                      <span key={r} style={s.roleBadge}>{r}</span>
                    )) : <span style={{ color: "#9ca3af" }}>none</span>}
                  </div>
                </div>
                <div style={s.row}>
                  <span style={s.label}>X-Client-Roles</span>
                  <div style={s.roles}>
                    {backend.clientRoles.length > 0 ? backend.clientRoles.map((r) => (
                      <span key={r} style={{ ...s.roleBadge, background: "#dbeafe", color: "#1e40af" }}>{r}</span>
                    )) : <span style={{ color: "#9ca3af" }}>none</span>}
                  </div>
                </div>
              </>
            ) : (
              <p style={{ color: "#9ca3af", fontSize: "13px" }}>Loading...</p>
            )}
          </div>
        </div>

        {/* Raw JWT */}
        <div style={s.section}>
          <button style={s.btn} onClick={() => setShowRaw(!showRaw)}>
            {showRaw ? "Hide" : "Show"} Raw JWT Claims
          </button>
          {showRaw && (
            <pre style={{ ...s.pre, marginTop: "12px" }}>{JSON.stringify(user, null, 2)}</pre>
          )}
        </div>
      </div>
    </>
  );
}
