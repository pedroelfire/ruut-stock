import 'server-only';
import { authResponseSchema, type MeResponse } from '@ruut/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { setSessionCookie } from './session';
import {
  UNAVAILABLE_MESSAGE,
  errorResponse,
  fetchUpstream,
  getClientIp,
  relayResponse,
} from './upstream';

/**
 * Sends credentials to the API and, on success, moves the JWT into the httpOnly cookie. Errors
 * (400, 401, 409, 429...) pass through with their status and body so the form can show them.
 */
export async function authenticate(
  request: NextRequest,
  path: 'auth/login' | 'auth/register',
  body: string,
): Promise<NextResponse> {
  let upstream: Response;
  try {
    upstream = await fetchUpstream({
      path,
      method: 'POST',
      body,
      clientIp: getClientIp(request.headers),
    });
  } catch {
    return errorResponse(502, 'UPSTREAM_ERROR', UNAVAILABLE_MESSAGE);
  }

  if (!upstream.ok) return relayResponse(upstream);

  const parsed = authResponseSchema.safeParse(await upstream.json().catch(() => null));
  if (!parsed.success) return errorResponse(502, 'UPSTREAM_ERROR', UNAVAILABLE_MESSAGE);

  const { token, user } = parsed.data.data;
  // Same shape as GET /auth/me: the user, never the token.
  const responseBody: MeResponse = { data: { user } };
  const response = NextResponse.json(responseBody, {
    status: upstream.status,
    headers: { 'cache-control': 'no-store' },
  });
  // A token without a future `exp` would leave the user "signed in" with nothing usable.
  if (!setSessionCookie(response, token)) {
    return errorResponse(502, 'UPSTREAM_ERROR', UNAVAILABLE_MESSAGE);
  }
  return response;
}
