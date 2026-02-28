import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../auth/auth-context";
import { Navbar } from "../components/Navbar";
import { apiCall } from "../api/client";

interface TenantUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  realmRoles?: string[];
  clientRoles?: string[];
}

interface AvailableRole {
  id: string;
  name: string;
  description?: string;
  composite?: boolean;
}

const s: Record<string, React.CSSProperties> = {
  container: { maxWidth: "1000px", margin: "0 auto", padding: "24px" },
  section: {
    background: "white", borderRadius: "8px", padding: "20px",
    marginBottom: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  h2: { fontSize: "16px", fontWeight: 600, marginBottom: "12px", color: "#374151" },
  form: { display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" as const },
  inputGroup: { display: "flex", flexDirection: "column" as const, gap: "4px" },
  label: { fontSize: "12px", fontWeight: 600, color: "#6b7280" },
  input: { padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px", width: "170px" },
  select: { padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px" },
  submitBtn: {
    padding: "8px 20px", background: "#0d9488", color: "white",
    border: "none", borderRadius: "6px", fontSize: "14px", fontWeight: 600, cursor: "pointer",
  },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: "13px" },
  th: { textAlign: "left" as const, padding: "10px 12px", borderBottom: "2px solid #e5e7eb", color: "#6b7280", fontWeight: 600 },
  td: { padding: "10px 12px", borderBottom: "1px solid #f3f4f6" },
  badge: { padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600, display: "inline-block", marginRight: "4px" },
  actionBtn: {
    padding: "4px 10px", borderRadius: "4px", border: "none",
    fontSize: "12px", fontWeight: 600, cursor: "pointer", marginRight: "4px",
  },
  error: { color: "#dc2626", fontSize: "13px", marginTop: "8px" },
  success: { color: "#059669", fontSize: "13px", marginTop: "8px" },
  empty: { textAlign: "center" as const, color: "#9ca3af", padding: "32px", fontSize: "14px" },
  roleBadge: { background: "#ecfdf5", color: "#065f46" },
  clientRoleBadge: { background: "#dbeafe", color: "#1e40af" },
  checkboxGroup: { display: "flex", gap: "8px", flexWrap: "wrap" as const, alignItems: "center" },
  checkLabel: { display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", cursor: "pointer" },
};

export function UsersPage() {
  const { user } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  // Create user form
  const [newEmail, setNewEmail] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRealmRole, setNewRealmRole] = useState("tenant_employee");
  const [newClientRoles, setNewClientRoles] = useState<string[]>([]);

  const clientRoles = user?.resource_access?.["doer-visa"]?.roles || [];
  const isAdmin = clientRoles.includes("manage_all") || clientRoles.includes("admin") || user?.realm_access?.roles?.includes("tenant_admin");

  // Split available roles into composite roles (assignable to users) and permissions
  const compositeRoles = availableRoles.filter((r) => r.composite);
  const permissionRoles = availableRoles.filter((r) => !r.composite);

  // Find tenant ID from the user's org
  useEffect(() => {
    apiCall<{ items: { id: string }[] }>("/api/tenants?limit=1")
      .then((res) => {
        const items = res?.items || res;
        if (Array.isArray(items) && items.length > 0) {
          setTenantId(items[0].id);
        }
      })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const loadUsers = useCallback(async () => {
    if (!tenantId) return;
    try {
      const data = await apiCall<TenantUser[]>(`/api/tenants/${tenantId}/users`);
      setUsers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
    }
  }, [tenantId]);

  const loadRoles = useCallback(async () => {
    if (!tenantId) return;
    try {
      const data = await apiCall<AvailableRole[]>(`/api/tenants/${tenantId}/users/roles/available`);
      setAvailableRoles(Array.isArray(data) ? data : []);
    } catch (e: any) {
      // Roles endpoint may not exist
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) {
      loadUsers();
      loadRoles();
    }
  }, [tenantId, loadUsers, loadRoles]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!tenantId) return;
    try {
      await apiCall(`/api/tenants/${tenantId}/users`, {
        method: "POST",
        body: JSON.stringify({
          email: newEmail,
          fullName: newFullName,
          password: newPassword,
          realmRole: newRealmRole,
          clientRoles: newClientRoles.length > 0 ? newClientRoles : undefined,
        }),
      });
      setSuccess(`User "${newEmail}" created successfully`);
      setTimeout(() => setSuccess(""), 3000);
      setNewEmail(""); setNewFullName(""); setNewPassword(""); setNewClientRoles([]);
      loadUsers();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleUser = async (uid: string, enable: boolean) => {
    if (!tenantId) return;
    setError("");
    try {
      await apiCall(`/api/tenants/${tenantId}/users/${uid}/${enable ? "enable" : "disable"}`, { method: "PUT" });
      loadUsers();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const removeUser = async (uid: string, email: string) => {
    if (!tenantId) return;
    if (!window.confirm(`Remove user "${email}" from this organization?`)) return;
    setError("");
    try {
      await apiCall(`/api/tenants/${tenantId}/users/${uid}`, { method: "DELETE" });
      loadUsers();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleClientRole = (role: string) => {
    setNewClientRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  if (loading) return <><Navbar /><div style={s.container}><p>Loading...</p></div></>;

  if (!isAdmin) {
    return (
      <>
        <Navbar />
        <div style={s.container}>
          <div style={s.section}>
            <p style={{ color: "#6b7280", textAlign: "center" }}>
              Only tenant administrators can manage users.
            </p>
          </div>
        </div>
      </>
    );
  }

  if (!tenantId) {
    return (
      <>
        <Navbar />
        <div style={s.container}>
          <div style={s.section}>
            <p style={{ color: "#dc2626", textAlign: "center" }}>
              Could not find your tenant. Make sure you are logged in as a tenant admin.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div style={s.container}>
        {/* Create User Form */}
        <div style={s.section}>
          <h2 style={s.h2}>Add New User</h2>
          <form style={s.form} onSubmit={handleCreateUser}>
            <div style={s.inputGroup}>
              <label style={s.label}>Full Name</label>
              <input style={s.input} value={newFullName} onChange={(e) => setNewFullName(e.target.value)} placeholder="John Doe" required />
            </div>
            <div style={s.inputGroup}>
              <label style={s.label}>Email</label>
              <input style={s.input} type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="john@acme.com" required />
            </div>
            <div style={s.inputGroup}>
              <label style={s.label}>Password</label>
              <input style={s.input} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 chars" required minLength={8} />
            </div>
            <div style={s.inputGroup}>
              <label style={s.label}>Realm Role</label>
              <select style={s.select} value={newRealmRole} onChange={(e) => setNewRealmRole(e.target.value)}>
                <option value="end_user">End User</option>
                <option value="tenant_employee">Employee</option>
              </select>
            </div>
            <button type="submit" style={s.submitBtn}>Add User</button>
          </form>

          {/* Role Assignment */}
          {compositeRoles.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <label style={s.label}>Product Role</label>
              <div style={{ ...s.checkboxGroup, marginTop: "6px" }}>
                {compositeRoles.map((role) => (
                  <label key={role.name} style={s.checkLabel}>
                    <input
                      type="checkbox"
                      checked={newClientRoles.includes(role.name)}
                      onChange={() => toggleClientRole(role.name)}
                    />
                    <span>{role.name}</span>
                    {role.description && <span style={{ color: "#9ca3af", fontSize: "11px" }}>({role.description})</span>}
                  </label>
                ))}
              </div>
              <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
                Each role includes a set of permissions. Users inherit all permissions from their assigned roles.
              </div>
            </div>
          )}
          {/* Fallback: if no composite roles, show all as individual permissions */}
          {compositeRoles.length === 0 && permissionRoles.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <label style={s.label}>Permissions (no roles defined — assigning directly)</label>
              <div style={{ ...s.checkboxGroup, marginTop: "6px" }}>
                {permissionRoles.map((role) => (
                  <label key={role.name} style={s.checkLabel}>
                    <input
                      type="checkbox"
                      checked={newClientRoles.includes(role.name)}
                      onChange={() => toggleClientRole(role.name)}
                    />
                    {role.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p style={s.error}>{error}</p>}
          {success && <p style={s.success}>{success}</p>}
        </div>

        {/* Users List */}
        <div style={s.section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <h2 style={s.h2}>Organization Users ({users.length})</h2>
            <button onClick={loadUsers} style={{ ...s.actionBtn, background: "#f3f4f6", color: "#374151" }}>Refresh</button>
          </div>

          {users.length === 0 ? (
            <div style={s.empty}>No users found.</div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Name</th>
                  <th style={s.th}>Email</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Realm Role</th>
                  <th style={s.th}>Product Roles</th>
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={s.td}>{u.firstName} {u.lastName}</td>
                    <td style={s.td}>{u.email || u.username}</td>
                    <td style={s.td}>
                      <span style={{
                        ...s.badge,
                        background: u.enabled ? "#d1fae5" : "#fee2e2",
                        color: u.enabled ? "#065f46" : "#991b1b",
                      }}>
                        {u.enabled ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td style={s.td}>
                      {(u.realmRoles || []).filter((r) => !["default-roles-doer", "offline_access", "uma_authorization"].includes(r)).map((r) => (
                        <span key={r} style={{ ...s.badge, ...s.roleBadge }}>{r}</span>
                      ))}
                    </td>
                    <td style={s.td}>
                      {(u.clientRoles || []).map((r) => (
                        <span key={r} style={{ ...s.badge, ...s.clientRoleBadge }}>{r}</span>
                      ))}
                    </td>
                    <td style={s.td}>
                      {u.enabled ? (
                        <button
                          onClick={() => toggleUser(u.id, false)}
                          style={{ ...s.actionBtn, background: "#fef3c7", color: "#92400e" }}
                        >
                          Disable
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleUser(u.id, true)}
                          style={{ ...s.actionBtn, background: "#d1fae5", color: "#065f46" }}
                        >
                          Enable
                        </button>
                      )}
                      <button
                        onClick={() => removeUser(u.id, u.email || u.username)}
                        style={{ ...s.actionBtn, background: "#fee2e2", color: "#991b1b" }}
                      >
                        Remove
                      </button>
                    </td>
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
