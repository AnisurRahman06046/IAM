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
import { setAuthHooks } from "../api/client";

const APISIX_BASE = "http://localhost:9080";
const KC_BASE = "http://localhost:8080";
const REALM = "doer";
const CLIENT_ID = "doer-visa";
const REDIRECT_URI = `${window.location.origin}/callback`;

interface AuthState {
  isAuthenticated: boolean;
  user: DecodedJwt | null;
  accessToken: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
}

interface RegisterData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(getAccessToken);
  const [user, setUser] = useState<DecodedJwt | null>(() => {
    const token = getAccessToken();
    return token ? decodeJwt(token) : null;
  });

  const isAuthenticated = !!accessToken && !!user;

  useEffect(() => {
    if (accessToken) {
      const decoded = decodeJwt(accessToken);
      setUser(decoded);
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
      prompt: "login",
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
    window.location.hash = "#/login";
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
      const raw = await resp.json();
      const tokens = raw.data || raw;
      setTokens(tokens.accessToken || tokens.access_token, tokens.refreshToken || tokens.refresh_token);
      setAccessToken(tokens.accessToken || tokens.access_token);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    setAuthHooks(refresh, logout);
  }, [refresh, logout]);

  const register = useCallback(
    async (data: RegisterData): Promise<{ success: boolean; error?: string }> => {
      try {
        const resp = await fetch(`${APISIX_BASE}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, product: CLIENT_ID }),
        });
        if (resp.ok) return { success: true };
        const err = await resp.json();
        return { success: false, error: err.message || "Registration failed" };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    },
    [],
  );

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, user, accessToken, login, logout, refresh, register }}
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
