import 'server-only';
import type { ApiErrorResponse, ErrorCode } from '@ruut/shared';
import { NextResponse } from 'next/server';
import { getServerEnv } from './env';

const UPSTREAM_TIMEOUT_MS = 15_000;
/** Same limit as express.json() in the API: bigger bodies would be rejected there anyway. */
export const MAX_FORWARDED_BODY_BYTES = 10 * 1024;

export const UNAVAILABLE_MESSAGE = 'The service is unavailable right now. Please try again.';
export const BODY_TOO_LARGE_MESSAGE = 'Request body is too large';

export function errorResponse(status: number, code: ErrorCode, message: string): NextResponse {
  const body: ApiErrorResponse = { error: { code, message } };
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

/**
 * The browser's IP: the last X-Forwarded-For entry, the one appended by the platform edge
 * (Railway). Earlier entries come from the client and can be forged, so they are dropped.
 */
export function getClientIp(headers: Headers): string | undefined {
  const forwarded = headers.get('x-forwarded-for');
  const last = forwarded?.split(',').at(-1)?.trim();
  return last || undefined;
}

export interface UpstreamRequest {
  /** API path without a leading slash, already encoded, with its query string if any. */
  path: string;
  method: 'GET' | 'POST' | 'DELETE';
  token?: string;
  /** Raw JSON body. */
  body?: string;
  clientIp?: string;
  signal?: AbortSignal;
}

/** Calls the Express API over the private network. Rejects when the API cannot be reached. */
export function fetchUpstream(request: UpstreamRequest): Promise<Response> {
  const baseUrl = getServerEnv().API_INTERNAL_URL.replace(/\/+$/, '');
  const headers = new Headers({ accept: 'application/json' });
  if (request.body !== undefined) headers.set('content-type', 'application/json');
  if (request.token) headers.set('authorization', `Bearer ${request.token}`);
  // Overwritten, never appended: the API trusts exactly one hop (trust proxy = 1, spec 02 §4).
  if (request.clientIp) headers.set('x-forwarded-for', request.clientIp);

  const timeout = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  return fetch(`${baseUrl}/${request.path}`, {
    method: request.method,
    headers,
    body: request.body,
    cache: 'no-store',
    redirect: 'manual',
    signal: request.signal ? AbortSignal.any([request.signal, timeout]) : timeout,
  });
}

const RELAYED_HEADERS = ['content-type', 'retry-after'];

/** Passes the API response through untouched: same status, same body, relevant headers only. */
export async function relayResponse(upstream: Response): Promise<NextResponse> {
  const hasBody = upstream.status !== 204 && upstream.status !== 304;
  const body = hasBody ? await upstream.arrayBuffer() : null;
  const headers = new Headers({ 'cache-control': 'no-store' });
  for (const name of RELAYED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextResponse(body, { status: upstream.status, headers });
}

export const JSON_REQUIRED_MESSAGE = 'Request body must be JSON';

function isJsonContentType(value: string | null): boolean {
  return value?.split(';')[0]?.trim().toLowerCase() === 'application/json';
}

export type JsonBodyResult = { ok: true; body: string } | { ok: false; response: NextResponse };

/**
 * Reads a JSON body to forward to the API. 400 VALIDATION_ERROR (the catalog status for a bad
 * body) when the content type is not `application/json`, which also stops `text/plain` form
 * posts, or when it exceeds the API limit. A declared Content-Length is checked before reading;
 * the real size is checked after, since the header can be missing or wrong.
 */
export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  if (!isJsonContentType(request.headers.get('content-type'))) {
    return { ok: false, response: errorResponse(400, 'VALIDATION_ERROR', JSON_REQUIRED_MESSAGE) };
  }
  const tooLarge = () => ({
    ok: false as const,
    response: errorResponse(400, 'VALIDATION_ERROR', BODY_TOO_LARGE_MESSAGE),
  });
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_FORWARDED_BODY_BYTES) return tooLarge();

  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_FORWARDED_BODY_BYTES) return tooLarge();
  return { ok: true, body };
}
