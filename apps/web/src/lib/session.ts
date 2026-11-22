import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServerEnv } from './env';
import { secondsUntilExpiry } from './jwt';

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: getServerEnv().NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  } as const;
}

export function getSessionCookieName(): string {
  return getServerEnv().SESSION_COOKIE_NAME;
}

/** Token from the incoming request (Route Handlers). */
export function readSessionToken(request: NextRequest): string | undefined {
  return request.cookies.get(getSessionCookieName())?.value || undefined;
}

/** Token for Server Components, which have no request object. */
export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(getSessionCookieName())?.value || undefined;
}

/**
 * Stores the JWT in the httpOnly session cookie. Its lifetime follows the token's own `exp`, so it
 * tracks JWT_EXPIRES_IN in the API instead of a second hard-coded duration. Returns false (and sets
 * nothing) when the token carries no future `exp`.
 */
export function setSessionCookie(response: NextResponse, token: string): boolean {
  const maxAge = secondsUntilExpiry(token);
  if (maxAge <= 0) return false;
  response.cookies.set(getSessionCookieName(), token, { ...baseCookieOptions(), maxAge });
  return true;
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(getSessionCookieName(), '', { ...baseCookieOptions(), maxAge: 0 });
}
