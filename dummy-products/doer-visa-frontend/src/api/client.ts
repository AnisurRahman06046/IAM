import { getAccessToken } from "../auth/token-storage";

const APISIX_BASE = "http://localhost:9080";

let refreshFn: (() => Promise<boolean>) | null = null;
let logoutFn: (() => Promise<void>) | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setAuthHooks(
  refresh: () => Promise<boolean>,
  logout: () => Promise<void>,
) {
  refreshFn = refresh;
  logoutFn = logout;
}

async function doFetch(path: string, options: RequestInit): Promise<Response> {
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

function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (refreshFn ? refreshFn() : Promise.resolve(false)).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiCall<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let resp = await doFetch(path, options);

  if (resp.status === 401) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      resp = await doFetch(path, options);
    } else {
      if (logoutFn) await logoutFn();
      throw new ApiError(401, "Session expired");
    }
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new ApiError(resp.status, body.error || body.message || `HTTP ${resp.status}`);
  }

  // Handle 204 No Content
  const text = await resp.text();
  if (!text) return undefined as T;
  return JSON.parse(text);
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
