import React from "react";
import { useAuth } from "../auth/auth-context";

const styles: Record<string, React.CSSProperties> = {
  nav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 24px",
    background: "#0d9488",
    color: "white",
  },
  brand: { fontSize: "18px", fontWeight: 700 },
  right: { display: "flex", alignItems: "center", gap: "12px" },
  email: { fontSize: "14px", opacity: 0.9 },
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: 600,
    background: "rgba(255,255,255,0.2)",
  },
  btn: {
    padding: "6px 14px",
    border: "1px solid rgba(255,255,255,0.4)",
    borderRadius: "6px",
    background: "transparent",
    color: "white",
    cursor: "pointer",
    fontSize: "13px",
  },
};

export function Navbar() {
  const { user, logout, refresh } = useAuth();

  return (
    <nav style={styles.nav}>
      <span style={styles.brand}>Doer Visa</span>
      <div style={styles.right}>
        <span style={styles.email}>{user?.email}</span>
        {user?.resource_access?.["doer-visa"]?.roles?.map((role) => (
          <span key={role} style={styles.badge}>
            {role}
          </span>
        ))}
        <button style={styles.btn} onClick={refresh}>
          Refresh Token
        </button>
        <button style={styles.btn} onClick={logout}>
          Logout
        </button>
      </div>
    </nav>
  );
}
