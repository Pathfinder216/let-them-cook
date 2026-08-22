const BASE_URL = '/api';

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/** Read a cookie value by name (used for the JS-readable CSRF token cookie). */
function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/** Headers for a mutating request: JSON content type + the double-submit CSRF token. */
function mutationHeaders(hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (hasBody) headers['Content-Type'] = 'application/json';
  const csrf = readCookie('kc_csrf');
  if (csrf) headers['x-csrf-token'] = csrf;
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    // A 401 means our session expired / is missing — notify the app to redirect to login.
    if (response.status === 401) {
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      body.error || `Request failed with status ${response.status}`,
      body.details,
    );
  }
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return response.json();
}

export async function apiGet<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });
  }
  const response = await fetch(url.toString(), { credentials: 'include' });
  return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: mutationHeaders(body !== undefined),
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: mutationHeaders(true),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: mutationHeaders(false),
  });
  return handleResponse<T>(response);
}

/**
 * Multipart file upload (POST). Uses the same session + CSRF handling as the JSON helpers —
 * media uploads are state-changing requests and are rejected with 403 without the token.
 * Content-Type is deliberately left unset so the browser adds the multipart boundary.
 */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: mutationHeaders(false),
    body: form,
  });
  return handleResponse<T>(response);
}
