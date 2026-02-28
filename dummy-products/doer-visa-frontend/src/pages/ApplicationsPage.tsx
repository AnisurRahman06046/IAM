import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../auth/auth-context";
import { Navbar } from "../components/Navbar";
import { apiCall } from "../api/client";

interface Application {
  id: string;
  userId: string;
  userEmail: string;
  destination: string;
  purpose: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const statusColors: Record<string, string> = {
  submitted: "#6b7280",
  processing: "#d97706",
  approved: "#059669",
  rejected: "#dc2626",
};

const statuses = ["all", "submitted", "processing", "approved", "rejected"];

const s: Record<string, React.CSSProperties> = {
  container: { maxWidth: "1000px", margin: "0 auto", padding: "24px" },
  section: {
    background: "white", borderRadius: "8px", padding: "20px",
    marginBottom: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  h2: { fontSize: "16px", fontWeight: 600, marginBottom: "12px", color: "#374151" },
  form: { display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" as const },
  inputGroup: { display: "flex", flexDirection: "column" as const, gap: "4px" },
  label: { fontSize: "12px", fontWeight: 600, color: "#6b7280" },
  input: { padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px", width: "200px" },
  submitBtn: {
    padding: "8px 20px", background: "#0d9488", color: "white",
    border: "none", borderRadius: "6px", fontSize: "14px", fontWeight: 600, cursor: "pointer",
  },
  tabs: { display: "flex", gap: "4px", marginBottom: "16px" },
  tab: {
    padding: "6px 16px", border: "1px solid #d1d5db", borderRadius: "6px",
    background: "white", cursor: "pointer", fontSize: "13px", fontWeight: 500,
  },
  tabActive: { background: "#0d9488", color: "white", borderColor: "#0d9488" },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: "13px" },
  th: { textAlign: "left" as const, padding: "10px 12px", borderBottom: "2px solid #e5e7eb", color: "#6b7280", fontWeight: 600 },
  td: { padding: "10px 12px", borderBottom: "1px solid #f3f4f6" },
  badge: { padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600, color: "white", display: "inline-block" },
  actionBtn: {
    padding: "4px 10px", borderRadius: "4px", border: "none",
    fontSize: "12px", fontWeight: 600, cursor: "pointer", marginRight: "4px",
  },
  error: { color: "#dc2626", fontSize: "13px", marginTop: "8px" },
  success: { color: "#059669", fontSize: "13px", marginTop: "8px" },
  empty: { textAlign: "center" as const, color: "#9ca3af", padding: "32px", fontSize: "14px" },
};

export function ApplicationsPage() {
  const { user } = useAuth();
  const [apps, setApps] = useState<Application[]>([]);
  const [filter, setFilter] = useState("all");
  const [destination, setDestination] = useState("");
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const clientRoles = user?.resource_access?.["doer-visa"]?.roles || [];
  const canApply = clientRoles.includes("apply_visa") || clientRoles.includes("manage_all");
  const canProcess = clientRoles.includes("process_visa") || clientRoles.includes("manage_all");
  const canDecide = clientRoles.includes("approve_visa") || clientRoles.includes("manage_all");
  const isAdmin = clientRoles.includes("manage_all");

  const loadApps = useCallback(async () => {
    try {
      const data = await apiCall<Application[]>("/api/visa/applications");
      setApps(data);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { loadApps(); }, [loadApps]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");
    try {
      await apiCall("/api/visa/applications", {
        method: "POST",
        body: JSON.stringify({ destination, purpose }),
      });
      setDestination(""); setPurpose("");
      setSuccess("Application submitted successfully!");
      setTimeout(() => setSuccess(""), 3000);
      loadApps();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleAction = async (id: string, action: string, confirmMsg: string) => {
    if (!window.confirm(confirmMsg)) return;
    setError("");
    try {
      if (action === "delete") {
        await apiCall(`/api/visa/applications/${id}`, { method: "DELETE" });
      } else {
        await apiCall(`/api/visa/applications/${id}/${action}`, { method: "PUT" });
      }
      loadApps();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const filtered = filter === "all" ? apps : apps.filter((a) => a.status === filter);

  return (
    <>
      <Navbar />
      <div style={s.container}>
        {/* Create Form */}
        {canApply && (
          <div style={s.section}>
            <h2 style={s.h2}>New Visa Application</h2>
            <form style={s.form} onSubmit={handleSubmit}>
              <div style={s.inputGroup}>
                <label style={s.label}>Destination</label>
                <input style={s.input} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. United Kingdom" required />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>Purpose</label>
                <input style={s.input} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Business trip" required />
              </div>
              <button type="submit" style={s.submitBtn}>Submit</button>
            </form>
            {success && <p style={s.success}>{success}</p>}
          </div>
        )}

        {/* Application List */}
        <div style={s.section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <h2 style={s.h2}>Applications</h2>
            <button onClick={loadApps} style={{ ...s.actionBtn, background: "#f3f4f6", color: "#374151" }}>Refresh</button>
          </div>

          {/* Status Filter Tabs */}
          <div style={s.tabs}>
            {statuses.map((st) => (
              <button
                key={st}
                onClick={() => setFilter(st)}
                style={{ ...s.tab, ...(filter === st ? s.tabActive : {}) }}
              >
                {st.charAt(0).toUpperCase() + st.slice(1)}
                {st !== "all" ? ` (${apps.filter((a) => a.status === st).length})` : ` (${apps.length})`}
              </button>
            ))}
          </div>

          {error && <p style={s.error}>{error}</p>}

          {filtered.length === 0 ? (
            <div style={s.empty}>No applications found.</div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Destination</th>
                  <th style={s.th}>Purpose</th>
                  <th style={s.th}>Applicant</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Created</th>
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((app) => (
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
                    <td style={s.td}>
                      {canProcess && app.status === "submitted" && (
                        <button
                          onClick={() => handleAction(app.id, "process", "Move this application to processing?")}
                          style={{ ...s.actionBtn, background: "#fef3c7", color: "#92400e" }}
                        >
                          Process
                        </button>
                      )}
                      {canDecide && app.status === "processing" && (
                        <button
                          onClick={() => handleAction(app.id, "approve", "Approve this application?")}
                          style={{ ...s.actionBtn, background: "#d1fae5", color: "#065f46" }}
                        >
                          Approve
                        </button>
                      )}
                      {canDecide && (app.status === "submitted" || app.status === "processing") && (
                        <button
                          onClick={() => handleAction(app.id, "reject", "Reject this application? This cannot be undone.")}
                          style={{ ...s.actionBtn, background: "#fee2e2", color: "#991b1b" }}
                        >
                          Reject
                        </button>
                      )}
                      {(app.userId === user?.sub && app.status === "submitted") || isAdmin ? (
                        <button
                          onClick={() => handleAction(app.id, "delete", "Delete this application? This cannot be undone.")}
                          style={{ ...s.actionBtn, background: "#f3f4f6", color: "#6b7280" }}
                        >
                          Delete
                        </button>
                      ) : null}
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
