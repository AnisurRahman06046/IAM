import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../auth/auth-context";
import { Navbar } from "../components/Navbar";
import { ApplicationList } from "../components/ApplicationList";
import { apiCall } from "../api/client";

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: "1000px", margin: "0 auto", padding: "24px" },
  section: {
    background: "white",
    borderRadius: "8px",
    padding: "24px",
    marginBottom: "20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  h2: { fontSize: "18px", fontWeight: 600, marginBottom: "16px" },
  h3: { fontSize: "15px", fontWeight: 600, marginBottom: "12px", color: "#374151" },
  claims: {
    background: "#f9fafb",
    borderRadius: "6px",
    padding: "16px",
    fontSize: "13px",
    fontFamily: "monospace",
    whiteSpace: "pre-wrap" as const,
    maxHeight: "300px",
    overflow: "auto",
    border: "1px solid #e5e7eb",
  },
  form: { display: "flex", gap: "12px", alignItems: "flex-end" },
  inputGroup: { display: "flex", flexDirection: "column" as const, gap: "4px" },
  label: { fontSize: "12px", fontWeight: 600, color: "#6b7280" },
  input: {
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "14px",
  },
  submitBtn: {
    padding: "8px 20px",
    background: "#0d9488",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  error: { color: "#ef4444", fontSize: "13px", marginTop: "8px" },
  toggle: {
    fontSize: "13px",
    color: "#0d9488",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    textDecoration: "underline",
  },
};

interface Application {
  id: string;
  userId: string;
  userEmail: string;
  destination: string;
  purpose: string;
  status: string;
  createdAt: string;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [destination, setDestination] = useState("");
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState("");
  const [showClaims, setShowClaims] = useState(false);

  const clientRoles = user?.resource_access?.["doer-visa"]?.roles || [];
  const canApply = clientRoles.includes("apply_visa") || clientRoles.includes("manage_all");

  const loadApplications = useCallback(async () => {
    try {
      const data = await apiCall<Application[]>("/api/visa/applications");
      setApplications(data);
    } catch (e) {
      console.error("Failed to load applications:", e);
    }
  }, []);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await apiCall("/api/visa/applications", {
        method: "POST",
        body: JSON.stringify({ destination, purpose }),
      });
      setDestination("");
      setPurpose("");
      loadApplications();
    } catch (e: any) {
      setError(e.message || "Failed to create application");
    }
  };

  const orgId = user?.organization
    ? Array.isArray(user.organization) ? user.organization[0] : Object.keys(user.organization)[0]
    : "none";

  return (
    <>
      <Navbar />
      <div style={styles.container}>
        {/* User Info */}
        <div style={styles.section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={styles.h2}>User Info</h2>
            <button style={styles.toggle} onClick={() => setShowClaims(!showClaims)}>
              {showClaims ? "Hide" : "Show"} JWT Claims
            </button>
          </div>
          <p style={{ fontSize: "14px", color: "#374151" }}>
            <strong>Email:</strong> {user?.email} &nbsp;|&nbsp;
            <strong>Org:</strong> {orgId} &nbsp;|&nbsp;
            <strong>Realm Roles:</strong> {user?.realm_access?.roles?.join(", ") || "none"} &nbsp;|&nbsp;
            <strong>Client Roles:</strong> {clientRoles.join(", ") || "none"}
          </p>
          {showClaims && <pre style={styles.claims}>{JSON.stringify(user, null, 2)}</pre>}
        </div>

        {/* New Application Form */}
        {canApply && (
          <div style={styles.section}>
            <h3 style={styles.h3}>New Visa Application</h3>
            <form style={styles.form} onSubmit={handleSubmit}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Destination</label>
                <input
                  style={styles.input}
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. United Kingdom"
                  required
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Purpose</label>
                <input
                  style={styles.input}
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Business trip"
                  required
                />
              </div>
              <button type="submit" style={styles.submitBtn}>
                Submit Application
              </button>
            </form>
            {error && <p style={styles.error}>{error}</p>}
          </div>
        )}

        {/* Applications List */}
        <div style={styles.section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={styles.h2}>Applications</h2>
            <button style={{ ...styles.toggle }} onClick={loadApplications}>
              Refresh
            </button>
          </div>
          <ApplicationList
            applications={applications}
            clientRoles={clientRoles}
            onRefresh={loadApplications}
          />
        </div>
      </div>
    </>
  );
}
