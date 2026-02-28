import React, { useState } from "react";
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
    width: "420px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
  },
  title: { fontSize: "24px", fontWeight: 700, marginBottom: "8px", textAlign: "center" as const },
  subtitle: { fontSize: "14px", color: "#6b7280", marginBottom: "32px", textAlign: "center" as const },
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
    marginBottom: "24px",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    margin: "24px 0",
    color: "#9ca3af",
    fontSize: "13px",
  },
  line: { flex: 1, height: "1px", background: "#e5e7eb" },
  form: { display: "flex", flexDirection: "column" as const, gap: "12px" },
  input: {
    padding: "10px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "14px",
    outline: "none",
  },
  registerBtn: {
    width: "100%",
    padding: "10px",
    background: "white",
    color: "#0d9488",
    border: "2px solid #0d9488",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  error: { color: "#ef4444", fontSize: "13px", textAlign: "center" as const },
  success: { color: "#10b981", fontSize: "13px", textAlign: "center" as const },
};

export function LoginPage() {
  const { login, register } = useAuth();
  const [showRegister, setShowRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const result = await register({ email, phone, password, fullName });
    if (result.success) {
      setMessage({ type: "success", text: "Registration successful! You can now sign in." });
      setShowRegister(false);
    } else {
      setMessage({ type: "error", text: result.error || "Registration failed" });
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Doer Visa</h1>
        <p style={styles.subtitle}>Visa application management</p>

        {message && (
          <p style={message.type === "error" ? styles.error : styles.success}>{message.text}</p>
        )}

        <button style={styles.loginBtn} onClick={login}>
          Sign In with Keycloak
        </button>

        <div style={styles.divider}>
          <div style={styles.line} />
          <span>or</span>
          <div style={styles.line} />
        </div>

        {!showRegister ? (
          <button style={styles.registerBtn} onClick={() => setShowRegister(true)}>
            Create New Account
          </button>
        ) : (
          <form style={styles.form} onSubmit={handleRegister}>
            <input
              style={styles.input}
              type="text"
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <input
              style={styles.input}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              style={styles.input}
              type="tel"
              placeholder="Phone (e.g. +966501234567)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <input
              style={styles.input}
              type="password"
              placeholder="Password (min 8 chars, 1 upper, 1 lower, 1 digit, 1 special)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <button type="submit" style={styles.registerBtn}>
              Register
            </button>
            <button
              type="button"
              style={{ ...styles.registerBtn, border: "1px solid #d1d5db", color: "#6b7280" }}
              onClick={() => setShowRegister(false)}
            >
              Cancel
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
