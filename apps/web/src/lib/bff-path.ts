/**
 * API path prefixes the browser may reach through /api/bff (spec 03 §3). Anything else, auth
 * included, answers 404, so the gateway is never an open proxy to the API.
 */
const ALLOWED_ROOTS: Record<string, { requiresSubpath: boolean }> = {
  market: { requiresSubpath: true },
  watchlist: { requiresSubpath: false },
};

// eslint-disable-next-line no-control-regex -- control characters are exactly what it must catch
const UNSAFE_SEGMENT = /[/\\\u0000-\u001f\u007f]/;

function isSafeSegment(segment: string): boolean {
  return segment !== '' && segment !== '.' && segment !== '..' && !UNSAFE_SEGMENT.test(segment);
}

/**
 * Turns the decoded `[...path]` segments into the API path, or null when it is not allowed.
 * Dot segments are rejected because `market/%2E%2E/auth/me` would otherwise resolve to `auth/me`
 * once joined, slipping past the allow list.
 */
export function toAllowedApiPath(segments: readonly string[]): string | null {
  const [root, ...rest] = segments;
  if (root === undefined) return null;
  const rule = Object.hasOwn(ALLOWED_ROOTS, root) ? ALLOWED_ROOTS[root] : undefined;
  if (!rule || (rule.requiresSubpath && rest.length === 0)) return null;
  if (!segments.every(isSafeSegment)) return null;
  return segments.map(encodeURIComponent).join('/');
}
