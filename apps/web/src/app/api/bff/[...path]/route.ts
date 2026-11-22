import type { NextRequest } from 'next/server';
import { toAllowedApiPath } from '@/lib/bff-path';
import { rejectCrossSite } from '@/lib/same-origin';
import { clearSessionCookie, readSessionToken } from '@/lib/session';
import {
  UNAVAILABLE_MESSAGE,
  errorResponse,
  fetchUpstream,
  getClientIp,
  readJsonBody,
  relayResponse,
} from '@/lib/upstream';

interface BffContext {
  params: Promise<{ path: string[] }>;
}

const SESSION_EXPIRED_MESSAGE = 'Your session expired. Please sign in again.';

/**
 * Gateway from the browser to the API (spec 03 §3): adds the Bearer token from the httpOnly
 * cookie, keeps the query string and the browser IP, and relays status and body untouched.
 */
async function handle(request: NextRequest, context: BffContext) {
  const { path } = await context.params;
  const apiPath = toAllowedApiPath(path);
  if (apiPath === null) return errorResponse(404, 'NOT_FOUND', 'Route not found');

  const method = request.method === 'POST' || request.method === 'DELETE' ? request.method : 'GET';
  // Defense in depth: SameSite=Lax already keeps the cookie off cross-site POST and DELETE.
  if (method !== 'GET') {
    const crossSite = rejectCrossSite(request);
    if (crossSite) return crossSite;
  }

  const token = readSessionToken(request);
  if (!token) return errorResponse(401, 'UNAUTHORIZED', SESSION_EXPIRED_MESSAGE);

  let body: string | undefined;
  if (method === 'POST') {
    const result = await readJsonBody(request);
    if (!result.ok) return result.response;
    body = result.body;
  }

  let upstream: Response;
  try {
    upstream = await fetchUpstream({
      path: `${apiPath}${request.nextUrl.search}`,
      method,
      token,
      body,
      clientIp: getClientIp(request.headers),
      // Lets the client cancel stale searches all the way to the API.
      signal: request.signal,
    });
  } catch {
    return errorResponse(502, 'UPSTREAM_ERROR', UNAVAILABLE_MESSAGE);
  }

  const response = await relayResponse(upstream);
  // The API rejected the token: drop the cookie so proxy.ts stops treating the user as signed in.
  if (upstream.status === 401) clearSessionCookie(response);
  return response;
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
