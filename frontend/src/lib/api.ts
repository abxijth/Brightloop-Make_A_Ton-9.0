const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public fields: Record<string, string>,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, params?: Record<string, string | number | undefined>, body?: unknown): Promise<T> {
  const url = new URL(path, BASE);
  Object.entries(params ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  });
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const err = data?.error;
    throw new ApiError(err?.message ?? res.statusText, res.status, err?.code ?? 'error', err?.fields ?? {});
  }
  return res.json();
}

/** Fetch JSON from the API with the auth cookie; errors use the shared error shape. */
export const apiGet = <T>(path: string, params?: Record<string, string | number | undefined>) =>
  request<T>('GET', path, params);

export const apiPost = <T>(path: string, body?: unknown) => request<T>('POST', path, undefined, body ?? {});
