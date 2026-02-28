import React from "react";
import { useAuth } from "../auth/auth-context";

const navLinks = [
  { key: "dashboard", label: "Dashboard" },
  { key: "applications", label: "Applications" },
  { key: "users", label: "Users", adminOnly: true },
  { key: "profile", label: "Profile" },
];

function getActiveRoute(): string {
  const hash = window.location.hash.replace("#/", "").split("/")[0];
  return hash || "dashboard";
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 24px",
    background: "#0d9488",
    color: "white",
    height: "52px",
  },
  left: { display: "flex", alignItems: "center", gap: "24px" },
  brand: { fontSize: "18px", fontWeight: 700 },
  navLink: {
    color: "rgba(255,255,255,0.7)",
    textDecoration: "none",
    fontSize: "14px",
    fontWeight: 500,
    padding: "14px 4px",
    borderBottom: "2px solid transparent",
    cursor: "pointer",
  },
  navLinkActive: {
    color: "white",
    borderBottomColor: "white",
  },
  right: { display: "flex", alignItems: "center", gap: "12px" },
  email: { fontSize: "13px", opacity: 0.9 },
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: 600,
    background: "rgba(255,255,255,0.2)",
  },
  btn: {
    padding: "5px 12px",
    border: "1px solid rgba(255,255,255,0.4)",
    borderRadius: "6px",
    background: "transparent",
    color: "white",
    cursor: "pointer",
    fontSize: "12px",
  },
};

export function Navbar() {
  const { user, logout, refresh } = useAuth();
  const active = getActiveRoute();
  const isAdmin = user?.realm_access?.roles?.includes("tenant_admin") ||
    user?.resource_access?.["doer-visa"]?.roles?.includes("manage_all");

  const visibleLinks = navLinks.filter((link) => !(link as any).adminOnly || isAdmin);

  return (
    <nav style={styles.nav}>
      <div style={styles.left}>
        <span style={styles.brand}>Doer Visa</span>
        {visibleLinks.map((link) => (
          <a
            key={link.key}
            href={`#/${link.key}`}
            style={{
              ...styles.navLink,
              ...(active === link.key ? styles.navLinkActive : {}),
            }}
          >
            {link.label}
          </a>
        ))}
      </div>
      <div style={styles.right}>
        <span style={styles.email}>{user?.email}</span>
        <button style={styles.btn} onClick={refresh}>
          Refresh
        </button>
        <button style={styles.btn} onClick={logout}>
          Logout
        </button>
      </div>
    </nav>
  );
}
