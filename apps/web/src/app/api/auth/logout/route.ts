import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { rejectCrossSite } from '@/lib/same-origin';
import { clearSessionCookie } from '@/lib/session';

/**
 * Signs out. POST plus the same-origin check stop other sites from triggering it with a form;
 * note that GET /api/auth/expired still allows a CSRF logout (accepted risk, spec 03 §3).
 */
export function POST(request: NextRequest) {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;
  const response = new NextResponse(null, {
    status: 204,
    headers: { 'cache-control': 'no-store' },
  });
  clearSessionCookie(response);
  return response;
}
