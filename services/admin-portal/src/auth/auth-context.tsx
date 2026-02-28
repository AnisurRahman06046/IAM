import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { generateCodeVerifier, generateCodeChallenge } from "./pkce";
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  decodeJwt,
  type DecodedJwt,
} from "./token-storage";

const APISIX_BASE = "http://localhost:9080";
const KC_BASE = "http://localhost:8080";
const REALM = "doer";
const CLIENT_ID = "doer-admin";
const REDIRECT_URI = `${window.location.origin}/callback`;

interface AuthState {
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  user: DecodedJwt | null;
  accessToken: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(getAccessToken);
  const [user, setUser] = useState<DecodedJwt | null>(() => {
    const token = getAccessToken();
    return token ? decodeJwt(token) : null;
  });

  const isAuthenticated = !!accessToken && !!user;
  const isPlatformAdmin = !!user?.realm_access?.roles?.includes("platform_admin");

  useEffect(() => {
    if (accessToken) {
      setUser(decodeJwt(accessToken));
    } else {
      setUser(null);
    }
  }, [accessToken]);

  const login = useCallback(async () => {
    const verifier = generateCodeVerifier();
    sessionStorage.setItem("pkce_verifier", verifier);
    const challenge = await generateCodeChallenge(verifier);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: "openid",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    window.location.href = `${KC_BASE}/realms/${REALM}/protocol/openid-connect/auth?${params}`;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      await fetch(`${APISIX_BASE}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken, clientId: CLIENT_ID }),
      });
    } catch {
      // ignore logout errors
    }
    clearTokens();
    setAccessToken(null);
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const resp = await fetch(`${APISIX_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken, clientId: CLIENT_ID }),
      });
      if (!resp.ok) return false;
      const resp_data = await resp.json();
      const tokens = resp_data.data || resp_data;
      setTokens(tokens.accessToken, tokens.refreshToken);
      setAccessToken(tokens.accessToken);
      return true;
    } catch {
      return false;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isPlatformAdmin, user, accessToken, login, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { APISIX_BASE, REDIRECT_URI, CLIENT_ID };
