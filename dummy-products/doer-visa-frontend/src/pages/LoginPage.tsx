import React from "react";
import { useAuth } from "../auth/auth-context";

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0d9488 0%, #065f46 100%)",
  },
  card: {
    background: "white",
    borderRadius: "12px",
    padding: "40px",
    width: "400px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
    textAlign: "center" as const,
  },
  title: { fontSize: "24px", fontWeight: 700, marginBottom: "8px" },
  subtitle: { fontSize: "14px", color: "#6b7280", marginBottom: "32px" },
  loginBtn: {
    width: "100%",
    padding: "12px",
    background: "#0d9488",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: "16px",
  },
  note: { fontSize: "12px", color: "#9ca3af" },
};

export function LoginPage() {
  const { login } = useAuth();

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Doer Visa</h1>
        <p style={styles.subtitle}>Visa application management</p>
        <button style={styles.loginBtn} onClick={login}>
          Sign In with Keycloak
        </button>
        <p style={styles.note}>
          New users are added by your organization's administrator.
        </p>
      </div>
    </div>
  );
}
