import type { ErrorBody } from '@finapp/contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorBody,
  ) {
    super(body.error);
    this.name = 'ApiError';
  }
}

let csrfToken: string | undefined;

/** Set from the session endpoint; sent on every write (docs/adr/0004). */
export function setCsrfToken(token: string | undefined): void {
  csrfToken = token;
}

/** Called when the API says the session is gone, so the app can show the login screen. */
let onUnauthenticated: () => void = () => undefined;
export function setUnauthenticatedHandler(handler: () => void): void {
  onUnauthenticated = handler;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(method !== 'GET' && csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, { error: 'network' });
  }
  if (response.status === 204) return undefined as T;
  const json: unknown = await response.json().catch(() => ({ error: 'internal' }));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/session')) onUnauthenticated();
    throw new ApiError(response.status, json as ErrorBody);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
};
