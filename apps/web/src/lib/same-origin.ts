import 'server-only';
import type { NextResponse } from 'next/server';
import { errorResponse } from './upstream';

export const CROSS_SITE_MESSAGE = 'Cross-site requests are not allowed.';

function requestHost(headers: Headers): string | null {
  const forwardedHost = headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  return forwardedHost || headers.get('host');
}

/**
 * True when a state-changing request did not come from our own pages (login CSRF: a
 * `<form enctype="text/plain">` on another site can post a valid JSON body).
 * - `Sec-Fetch-Site` is set by the browser and cannot be forged by a page: only `same-origin`
 *   and `none` (typed URL, bookmark) pass.
 * - Fallback for browsers without it: when `Origin` is present, its host must match ours.
 * Requests with neither header (curl, server-to-server) carry no ambient browser cookie risk.
 */
export function isCrossSiteRequest(headers: Headers): boolean {
  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite !== null) return fetchSite !== 'same-origin' && fetchSite !== 'none';

  const origin = headers.get('origin');
  if (origin === null) return false;
  try {
    // `Origin: null` (sandboxed iframes, some redirects) throws here and counts as cross-site.
    return new URL(origin).host !== requestHost(headers);
  } catch {
    return true;
  }
}

/**
 * 403 for cross-site requests, or null to continue. Code VALIDATION_ERROR: the catalog has no
 * 403 entry, and UNAUTHORIZED is reserved for sessions the API rejected (the client reacts to it
 * by signing the user out).
 */
export function rejectCrossSite(request: Request): NextResponse | null {
  return isCrossSiteRequest(request.headers)
    ? errorResponse(403, 'VALIDATION_ERROR', CROSS_SITE_MESSAGE)
    : null;
}
