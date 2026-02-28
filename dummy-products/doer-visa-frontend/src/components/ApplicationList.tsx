import React from "react";
import { apiCall } from "../api/client";

interface Application {
  id: string;
  userId: string;
  userEmail: string;
  destination: string;
  purpose: string;
  status: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  submitted: "#6b7280",
  processing: "#f59e0b",
  approved: "#10b981",
  rejected: "#ef4444",
};

const styles: Record<string, React.CSSProperties> = {
  table: { width: "100%", borderCollapse: "collapse", fontSize: "14px" },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: "2px solid #e5e7eb",
    fontWeight: 600,
    color: "#6b7280",
    fontSize: "12px",
    textTransform: "uppercase",
  },
  td: { padding: "10px 12px", borderBottom: "1px solid #f3f4f6" },
  badge: {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: 600,
    color: "white",
  },
  btn: {
    padding: "4px 10px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    color: "white",
    marginRight: "4px",
  },
};

interface Props {
  applications: Application[];
  clientRoles: string[];
  onRefresh: () => void;
}

export function ApplicationList({ applications, clientRoles, onRefresh }: Props) {
  const canProcess =
    clientRoles.includes("process_visa") || clientRoles.includes("manage_all");
  const canApprove =
    clientRoles.includes("approve_visa") || clientRoles.includes("manage_all");

  const handleProcess = async (id: string) => {
    await apiCall(`/api/visa/applications/${id}/process`, { method: "PUT" });
    onRefresh();
  };

  const handleApprove = async (id: string) => {
    await apiCall(`/api/visa/applications/${id}/approve`, { method: "PUT" });
    onRefresh();
  };

  if (applications.length === 0) {
    return <p style={{ color: "#6b7280", padding: "20px 0" }}>No applications yet.</p>;
  }

  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Destination</th>
          <th style={styles.th}>Purpose</th>
          <th style={styles.th}>Applicant</th>
          <th style={styles.th}>Status</th>
          <th style={styles.th}>Created</th>
          {(canProcess || canApprove) && <th style={styles.th}>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {applications.map((app) => (
          <tr key={app.id}>
            <td style={styles.td}>{app.destination}</td>
            <td style={styles.td}>{app.purpose}</td>
            <td style={styles.td}>{app.userEmail}</td>
            <td style={styles.td}>
              <span
                style={{
                  ...styles.badge,
                  background: statusColors[app.status] || "#6b7280",
                }}
              >
                {app.status}
              </span>
            </td>
            <td style={styles.td}>{new Date(app.createdAt).toLocaleDateString()}</td>
            {(canProcess || canApprove) && (
              <td style={styles.td}>
                {canProcess && app.status === "submitted" && (
                  <button
                    style={{ ...styles.btn, background: "#f59e0b" }}
                    onClick={() => handleProcess(app.id)}
                  >
                    Process
                  </button>
                )}
                {canApprove && app.status === "processing" && (
                  <button
                    style={{ ...styles.btn, background: "#10b981" }}
                    onClick={() => handleApprove(app.id)}
                  >
                    Approve
                  </button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
