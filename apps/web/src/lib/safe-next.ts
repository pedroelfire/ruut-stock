// eslint-disable-next-line no-control-regex -- control characters are exactly what it must catch
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * Returns `next` only when it is an internal path, otherwise `fallback`. Rejected:
 * - anything not starting with `/` (absolute URLs, `javascript:`...);
 * - protocol-relative `//host`;
 * - any `\`: browsers read `/\evil.com` as `//evil.com`;
 * - control characters: browsers strip tabs and newlines, so `/\t/evil.com` becomes `//evil.com`.
 */
export function getSafeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  if (next.includes('\\') || CONTROL_CHARACTERS.test(next)) return fallback;
  return next;
}
