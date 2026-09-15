import type { z } from 'zod';

import { env } from '@/lib/env';
import { useSessionStore, type SessionTokens } from '@/lib/session-store';

/** RFC 9457 Problem Details as returned by the API, plus the HTTP status. */
export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string | undefined;
  readonly errors: Record<string, string[]> | undefined;

  constructor(status: number, title: string, detail?: string, errors?: Record<string, string[]>) {
    super(detail ?? title);
    this.name = 'ApiError';
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.errors = errors;
  }
}

export interface RequestOptions<TResponse> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** JSON payload, or a FormData for a file upload (sent as multipart, never stringified). */
  body?: unknown;
  /** Attach the bearer token and refresh-and-retry once on 401. */
  auth?: boolean;
  /** Validates and types the JSON body. Omit for 204 responses. */
  schema?: z.ZodType<TResponse>;
  signal?: AbortSignal;
}

/**
 * Single HTTP entry point. Serializes JSON, attaches the access token, converts Problem Details into
 * ApiError, and performs exactly one refresh-and-retry when an authenticated call gets a 401.
 */
export async function apiRequest<TResponse = void>(
  path: string,
  options: RequestOptions<TResponse> = {},
): Promise<TResponse> {
  const first = await send(path, options, options.auth ? useSessionStore.getState().tokens?.accessToken : undefined);
  if (first.status !== 401 || !options.auth) {
    return parse(first, options.schema);
  }

  const refreshed = await refreshSession();
  if (!refreshed) {
    throw await toApiError(first);
  }

  const retried = await send(path, options, refreshed.accessToken);
  return parse(retried, options.schema);
}

let refreshInFlight: Promise<SessionTokens | null> | null = null;

/**
 * Exchanges the stored refresh token for a new pair. Concurrent callers share one request.
 * On failure the local session is cleared, which flips the router to the signed-out group.
 */
export function refreshSession(): Promise<SessionTokens | null> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<SessionTokens | null> {
  const store = useSessionStore.getState();
  const refreshToken = store.tokens?.refreshToken;
  if (!refreshToken) {
    return null;
  }

  let response: Response;
  try {
    response = await send('/api/auth/refresh', { method: 'POST', body: { refreshToken } });
  } catch {
    // Transport failure: keep the session; the user may simply be offline.
    return null;
  }

  if (!response.ok) {
    await store.clear();
    return null;
  }

  const tokens = (await response.json()) as SessionTokens;
  await store.setTokens(tokens);
  return tokens;
}

async function send<TResponse>(path: string, options: RequestOptions<TResponse>, accessToken?: string): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const multipart = options.body instanceof FormData;
  if (options.body !== undefined && !multipart) {
    headers['Content-Type'] = 'application/json';
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return fetch(`${env.EXPO_PUBLIC_API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    // A multipart body carries its own boundary, so it is passed through untouched.
    body: options.body === undefined ? undefined : multipart ? (options.body as FormData) : JSON.stringify(options.body),
    signal: options.signal,
  });
}

async function parse<TResponse>(response: Response, schema: z.ZodType<TResponse> | undefined): Promise<TResponse> {
  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === 204 || !schema) {
    return undefined as TResponse;
  }
  return schema.parse(await response.json());
}

async function toApiError(response: Response): Promise<ApiError> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('json')) {
    try {
      const problem = (await response.json()) as {
        title?: string;
        detail?: string;
        errors?: Record<string, string[]>;
      };
      return new ApiError(response.status, problem.title ?? `HTTP ${response.status}`, problem.detail, problem.errors);
    } catch {
      // fall through to a generic error
    }
  }
  return new ApiError(response.status, `HTTP ${response.status}`);
}
