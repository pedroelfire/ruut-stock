import { z } from 'zod';

const payloadSchema = z.object({ exp: z.number().int().positive() });

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Reads `exp` (seconds since the epoch) from a JWT **without verifying its signature**. Only good
 * for UX decisions (cookie lifetime, early redirects): the API is the one that verifies the token.
 */
export function readJwtExpiry(token: string): number | null {
  const segments = token.split('.');
  if (segments.length !== 3 || !segments[1]) return null;
  try {
    const result = payloadSchema.safeParse(JSON.parse(decodeBase64Url(segments[1])));
    return result.success ? result.data.exp : null;
  } catch {
    return null;
  }
}

/** Seconds the token is still valid for: 0 when expired or unreadable. */
export function secondsUntilExpiry(token: string, nowMs: number = Date.now()): number {
  const exp = readJwtExpiry(token);
  if (exp === null) return 0;
  return Math.max(0, exp - Math.floor(nowMs / 1000));
}
