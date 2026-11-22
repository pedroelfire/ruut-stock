import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { ApiError, parseResponse, toApiError } from './api-error';
import { EXPIRED_SESSION_PATH } from './session-paths';
import { getSessionToken } from './session';
import { UNAVAILABLE_MESSAGE, fetchUpstream, getClientIp } from './upstream';

/**
 * GET against the API from a Server Component, with the session token as Bearer. On a 401 it
 * redirects to EXPIRED_SESSION_PATH: the token may still look valid to proxy.ts (unexpired `exp`)
 * while the API rejects it, e.g. after a JWT_SECRET rotation, and redirecting straight to /login
 * would loop. Any other failure throws ApiError.
 */
export async function apiServer<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  const token = await getSessionToken();
  if (!token) redirect('/login');

  const clientIp = getClientIp(await headers());
  let response: Response;
  try {
    response = await fetchUpstream({ path, method: 'GET', token, clientIp });
  } catch {
    throw new ApiError('UPSTREAM_ERROR', UNAVAILABLE_MESSAGE, 502);
  }

  // redirect() throws on purpose, so it stays outside any try/catch.
  if (response.status === 401) redirect(EXPIRED_SESSION_PATH);
  if (!response.ok) throw await toApiError(response);
  return parseResponse(response, schema);
}
