import type { NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth-handler';
import { rejectCrossSite } from '@/lib/same-origin';
import { readJsonBody } from '@/lib/upstream';

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;
  const result = await readJsonBody(request);
  if (!result.ok) return result.response;
  // The API validates the credentials with the shared schema; no second copy of the rules here.
  return authenticate(request, 'auth/login', result.body);
}
