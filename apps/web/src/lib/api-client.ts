import type { z } from 'zod';
import { ApiError, NETWORK_ERROR_MESSAGE, parseResponse, toApiError } from './api-error';

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  /** Serialized as JSON. */
  body?: unknown;
  signal?: AbortSignal;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function send(path: string, options: ApiRequestOptions): Promise<Response> {
  const { method = 'GET', body, signal } = options;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    // A cancelled request is not a failure: callers (TanStack Query) expect the AbortError itself.
    if (isAbortError(error)) throw error;
    throw new ApiError('UPSTREAM_ERROR', NETWORK_ERROR_MESSAGE, 0);
  }
  if (!response.ok) throw await toApiError(response);
  return response;
}

/**
 * Calls a Next.js Route Handler (`/api/auth/*` or `/api/bff/*`) from the browser and validates the
 * response with its Zod schema. Throws ApiError on any failure. The session cookie travels on its
 * own; the JWT is never visible here.
 */
export async function apiRequest<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  options: ApiRequestOptions = {},
): Promise<z.output<TSchema>> {
  const response = await send(path, options);
  return parseResponse(response, schema);
}

/** Same as apiRequest for endpoints that answer without a body (204). */
export async function apiSend(path: string, options: ApiRequestOptions = {}): Promise<void> {
  await send(path, options);
}
