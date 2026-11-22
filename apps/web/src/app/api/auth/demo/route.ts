import type { NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth-handler';
import { getServerEnv } from '@/lib/env';
import { rejectCrossSite } from '@/lib/same-origin';
import { errorResponse } from '@/lib/upstream';

const DEMO_UNAVAILABLE_MESSAGE = 'The demo account is not available right now.';

/** Signs in with the demo account. Its credentials live only in server env vars. */
export async function POST(request: NextRequest) {
  // No body to check here, which makes the origin check the only CSRF barrier.
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;

  const { DEMO_USER_EMAIL, DEMO_USER_PASSWORD } = getServerEnv();
  if (!DEMO_USER_EMAIL || !DEMO_USER_PASSWORD) {
    // A deployment mistake: 500 INTERNAL_ERROR as in spec 02 §2, logged like any other.
    console.error('POST /api/auth/demo: DEMO_USER_EMAIL or DEMO_USER_PASSWORD is not set');
    return errorResponse(500, 'INTERNAL_ERROR', DEMO_UNAVAILABLE_MESSAGE);
  }
  const body = JSON.stringify({ email: DEMO_USER_EMAIL, password: DEMO_USER_PASSWORD });
  return authenticate(request, 'auth/login', body);
}
