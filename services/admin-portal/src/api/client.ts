import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "../auth/token-storage";

const APISIX_BASE = "http://localhost:9080";
const CLIENT_ID = "doer-admin";

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const resp = await fetch(`${APISIX_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken, clientId: CLIENT_ID }),
    });
    if (!resp.ok) {
      clearTokens();
      return false;
    }
    const raw = await resp.json();
    const tokens = raw.data || raw;
    if (!tokens.accessToken) {
      clearTokens();
      return false;
    }
    setTokens(tokens.accessToken, tokens.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = tryRefreshToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doFetch<T>(path: string, options: RequestInit): Promise<Response> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(`${APISIX_BASE}${path}`, { ...options, headers });
}

export async function apiCall<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let resp = await doFetch<T>(path, options);

  // Auto-refresh on 401
  if (resp.status === 401) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      resp = await doFetch<T>(path, options);
    } else {
      // Redirect to login
      window.location.href = "/login";
      throw new ApiError(401, "Session expired. Please login again.");
    }
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new ApiError(resp.status, body.error || body.message || `HTTP ${resp.status}`);
  }

  // Handle empty responses (204, etc.)
  const text = await resp.text();
  if (!text) return undefined as T;
  const json = JSON.parse(text);
  // Auth service wraps in { success, data } — unwrap if present
  if (json && typeof json === "object" && "success" in json && "data" in json) {
    return json.data as T;
  }
  return json as T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
