import { getAccessToken } from "../auth/token-storage";

const APISIX_BASE = "http://localhost:9080";

export async function apiCall<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const resp = await fetch(`${APISIX_BASE}${path}`, {
    ...options,
    headers,
  });

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
