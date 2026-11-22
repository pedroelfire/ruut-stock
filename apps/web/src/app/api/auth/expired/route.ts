import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';

// Route files may only export HTTP handlers and segment config, so this stays module-private.
const EXPIRED_LOGIN_PATH = '/login?expired=1';

/**
 * Landing point when the API rejects the session (spec 03 §3): Server Components cannot delete
 * cookies, so they redirect here. GET on purpose, which allows a CSRF logout; accepted risk in
 * the spec. The Location is relative so it never depends on the Host the server sees behind a proxy.
 */
export function GET() {
  const response = new NextResponse(null, {
    status: 307,
    headers: { location: EXPIRED_LOGIN_PATH, 'cache-control': 'no-store' },
  });
  clearSessionCookie(response);
  return response;
}
