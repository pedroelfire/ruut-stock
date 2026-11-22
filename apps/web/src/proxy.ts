import { NextResponse, type NextRequest } from 'next/server';
import { secondsUntilExpiry } from '@/lib/jwt';
import { clearSessionCookie, getSessionCookieName } from '@/lib/session';

const AUTH_PAGES = new Set(['/login', '/register']);

function redirectTo(request: NextRequest, pathname: string, params: Record<string, string> = {}) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = new URLSearchParams(params).toString();
  return NextResponse.redirect(url);
}

/**
 * Route protection (spec 03 §2). It only reads the JWT `exp` without verifying the signature:
 * that is the API's job, and an API 401 sends the user through /api/auth/expired anyway.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(getSessionCookieName())?.value;
  const hasValidSession = token !== undefined && secondsUntilExpiry(token) > 0;

  if (AUTH_PAGES.has(pathname)) {
    return hasValidSession ? redirectTo(request, '/') : NextResponse.next();
  }

  if (hasValidSession) return NextResponse.next();

  const next = `${pathname}${search}`;
  if (!token) return redirectTo(request, '/login', { next });

  const response = redirectTo(request, '/login', { expired: '1', next });
  clearSessionCookie(response);
  return response;
}

export const config = {
  // Everything except the Route Handlers (they answer 401 themselves), Next internals and static
  // files. Extensions are listed explicitly: a generic `\.\w+$` would also skip `/stocks/BRK.B`.
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)',
  ],
};
