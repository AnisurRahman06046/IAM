import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Spin } from "antd";
import { setTokens } from "../auth/token-storage";
import { APISIX_BASE, REDIRECT_URI, CLIENT_ID } from "../auth/auth-context";

export function CallbackPage() {
  const processed = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const verifier = sessionStorage.getItem("pkce_verifier");

    if (!code || !verifier) {
      console.error("Missing code or verifier");
      navigate("/login", { replace: true });
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
        window.history.replaceState({}, "", "/");
        window.location.href = "/";
      })
      .catch((err) => {
        console.error("Token exchange error:", err);
        navigate("/login", { replace: true });
      });
  }, [navigate]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Spin size="large" tip="Signing in..." />
    </div>
  );
}
