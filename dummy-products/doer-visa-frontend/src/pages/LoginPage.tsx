import React, { useState } from "react";
import { useAuth } from "../auth/auth-context";

const APISIX_BASE = "http://localhost:9080";

const s: Record<string, React.CSSProperties> = {
  container: {
    display: "flex", justifyContent: "center", alignItems: "center",
    minHeight: "100vh", background: "linear-gradient(135deg, #0d9488 0%, #065f46 100%)",
  },
  card: {
    background: "white", borderRadius: "12px", padding: "40px",
    width: "420px", boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
  },
  title: { fontSize: "24px", fontWeight: 700, marginBottom: "8px", textAlign: "center" as const },
  subtitle: { fontSize: "14px", color: "#6b7280", marginBottom: "24px", textAlign: "center" as const },
  loginBtn: {
    width: "100%", padding: "12px", background: "#0d9488", color: "white",
    border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: 600, cursor: "pointer",
  },
  divider: {
    display: "flex", alignItems: "center", gap: "12px",
    margin: "20px 0", color: "#9ca3af", fontSize: "13px",
  },
  line: { flex: 1, height: "1px", background: "#e5e7eb" },
  toggleBtn: {
    width: "100%", padding: "10px", background: "white", color: "#0d9488",
    border: "2px solid #0d9488", borderRadius: "8px", fontSize: "14px",
    fontWeight: 600, cursor: "pointer",
  },
  form: { display: "flex", flexDirection: "column" as const, gap: "10px" },
  input: {
    padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "6px",
    fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box" as const,
  },
  submitBtn: {
    width: "100%", padding: "10px", background: "#0d9488", color: "white",
    border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer",
  },
  cancelBtn: {
    width: "100%", padding: "10px", background: "white", color: "#6b7280",
    border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px", cursor: "pointer",
  },
  error: { color: "#dc2626", fontSize: "13px", textAlign: "center" as const, marginTop: "8px" },
  success: { color: "#059669", fontSize: "13px", textAlign: "center" as const, marginTop: "8px" },
  hint: { fontSize: "11px", color: "#9ca3af", marginTop: "-6px" },
};

export function LoginPage() {
  const { login } = useAuth();
  const [showRegister, setShowRegister] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [tenantAlias, setTenantAlias] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const resp = await fetch(`${APISIX_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: "doer-visa",
          fullName,
          email,
          phone,
          password,
          tenantAlias: tenantAlias || undefined,
        }),
      });
      const raw = await resp.json();
      const data = raw.data || raw;
      if (resp.ok) {
        setMessage({ type: "success", text: "Registration successful! You can now sign in." });
        setShowRegister(false);
        setFullName(""); setEmail(""); setPhone(""); setPassword(""); setTenantAlias("");
      } else {
        setMessage({ type: "error", text: data.message || data.error || "Registration failed" });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Registration failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.container}>
      <div style={s.card}>
        <h1 style={s.title}>Doer Visa</h1>
        <p style={s.subtitle}>Visa application management</p>

        {message && (
          <p style={message.type === "error" ? s.error : s.success}>{message.text}</p>
        )}

        {!showRegister ? (
          <>
            <button style={s.loginBtn} onClick={login}>
              Sign In with Keycloak
            </button>
            <div style={s.divider}>
              <div style={s.line} />
              <span>or</span>
              <div style={s.line} />
            </div>
            <button style={s.toggleBtn} onClick={() => setShowRegister(true)}>
              Create New Account
            </button>
          </>
        ) : (
          <form style={s.form} onSubmit={handleRegister}>
            <input style={s.input} type="text" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <input style={s.input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input style={s.input} type="tel" placeholder="Phone (e.g. +966501234567)" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            <input style={s.input} type="password" placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            <input style={s.input} type="text" placeholder="Organization Alias (e.g. acme-corp)" value={tenantAlias} onChange={(e) => setTenantAlias(e.target.value)} />
            <p style={s.hint}>Ask your organization admin for the alias. Leave empty if unsure.</p>
            <button type="submit" style={s.submitBtn} disabled={loading}>
              {loading ? "Registering..." : "Register"}
            </button>
            <button type="button" style={s.cancelBtn} onClick={() => { setShowRegister(false); setMessage(null); }}>
              Cancel
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
