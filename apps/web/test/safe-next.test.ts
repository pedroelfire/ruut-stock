import { describe, expect, it } from 'vitest';
import { getSafeNext } from '@/lib/safe-next';

describe('getSafeNext', () => {
  it.each(['/', '/stocks/AAPL', '/stocks/AAPL?range=6M', '/stocks/BRK.B#chart'])(
    'accepts the internal path %s',
    (next) => {
      expect(getSafeNext(next)).toBe(next);
    },
  );

  it.each([
    ['an absolute URL', 'https://evil.com'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a relative path', 'stocks/AAPL'],
    ['a protocol-relative URL', '//evil.com'],
    ['a backslash after the slash', '/\\evil.com'],
    ['a backslash anywhere', '/stocks\\..\\evil'],
    ['a tab that browsers strip', '/\t/evil.com'],
    ['a newline that browsers strip', '/\n/evil.com'],
  ])('rejects %s', (_label, next) => {
    expect(getSafeNext(next)).toBe('/');
  });

  it('falls back when next is missing or empty', () => {
    expect(getSafeNext(undefined)).toBe('/');
    expect(getSafeNext(null)).toBe('/');
    expect(getSafeNext('')).toBe('/');
    expect(getSafeNext('//evil.com', '/login')).toBe('/login');
  });
});
