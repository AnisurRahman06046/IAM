import React, { useEffect, useRef } from "react";
import { setTokens } from "../auth/token-storage";
import { APISIX_BASE, REDIRECT_URI, CLIENT_ID } from "../auth/auth-context";

export function CallbackPage() {
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const verifier = sessionStorage.getItem("pkce_verifier");

    if (!code || !verifier) {
      console.error("Missing code or verifier");
      window.location.hash = "#/login";
      return;
    }

    fetch(`${APISIX_BASE}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        codeVerifier: verifier,
        redirectUri: REDIRECT_URI,
        clientId: CLIENT_ID,
      }),
    })
      .then((resp) => {
        if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status}`);
        return resp.json();
      })
      .then((data) => {
        setTokens(data.access_token, data.refresh_token);
        sessionStorage.removeItem("pkce_verifier");
        // Clean URL and navigate to dashboard
        window.history.replaceState({}, "", window.location.pathname);
        window.location.hash = "#/dashboard";
        window.location.reload();
      })
      .catch((err) => {
        console.error("Token exchange error:", err);
        window.location.hash = "#/login";
      });
  }, []);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        fontSize: "18px",
        color: "#6b7280",
      }}
    >
      Signing in...
    </div>
  );
}
