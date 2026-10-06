import type { ApiError, ApiResponse } from '@naijaplay/shared';

export class ApiRequestError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Options = RequestInit & { retry?: boolean };

/** Absolute backend origin in prod (VITE_API_URL), same-origin proxy in dev. */
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '';

async function request<T>(path: string, options: Options = {}): Promise<T> {
  const { retry = true, ...init } = options;
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  } catch (err) {
    // Network failure: retry once for safe requests (unreliable connections).
    if (retry && (init.method === undefined || init.method === 'GET')) {
      await new Promise((r) => setTimeout(r, 700));
      return request<T>(path, { ...init, retry: false });
    }
    throw new ApiRequestError(0, 'NETWORK', 'Connection failed. Check your network and try again.');
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await res.json()) as ApiResponse<T>;
  } catch {
    if (!res.ok) throw new ApiRequestError(res.status, 'BAD_RESPONSE', 'Server returned an unexpected response.');
  }

  if (payload && payload.success === false) {
    const e = payload.error;
    throw new ApiRequestError(res.status, e.code, e.message, e.details);
  }
  if (!res.ok) throw new ApiRequestError(res.status, 'ERROR', `Request failed (${res.status}).`);
  if (payload && payload.success === true) return payload.data;
  return undefined as T;
}

export const api = {
  get: <T>(path: string, options?: Options) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Options) =>
    request<T>(path, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  patch: <T>(path: string, body?: unknown, options?: Options) =>
    request<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string, options?: Options) => request<T>(path, { ...options, method: 'DELETE' }),
};

/** Build a debounced key-friendly query string. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export type { ApiError };
