import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { proxy } from '@/proxy';
import { COOKIE_NAME, makeToken, nowSeconds, stubServerEnv } from './helpers';

function visit(path: string, token?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: token ? { cookie: `${COOKIE_NAME}=${token}` } : {},
  });
}

function redirectTarget(response: Response) {
  const location = response.headers.get('location');
  if (!location) throw new Error('Expected a redirect');
  const url = new URL(location);
  return { pathname: url.pathname, params: Object.fromEntries(url.searchParams) };
}

const isPassThrough = (response: Response) => response.headers.get('x-middleware-next') === '1';

describe('proxy', () => {
  beforeEach(() => stubServerEnv());

  it('sends visitors without a cookie to /login with the original path in next', () => {
    const response = proxy(visit('/stocks/AAPL?range=6M'));

    expect(response.status).toBe(307);
    expect(redirectTarget(response)).toEqual({
      pathname: '/login',
      params: { next: '/stocks/AAPL?range=6M' },
    });
  });

  it('sends an expired cookie to /login?expired=1 and clears it', () => {
    const response = proxy(visit('/', makeToken(nowSeconds() - 1)));

    expect(redirectTarget(response)).toEqual({
      pathname: '/login',
      params: { expired: '1', next: '/' },
    });
    expect(response.cookies.get(COOKIE_NAME)?.maxAge).toBe(0);
  });

  it('treats an unreadable cookie as expired', () => {
    const response = proxy(visit('/', 'not-a-jwt'));

    expect(redirectTarget(response).params.expired).toBe('1');
  });

  it('lets a live session through to protected pages', () => {
    expect(isPassThrough(proxy(visit('/', makeToken(nowSeconds() + 600))))).toBe(true);
  });

  it.each(['/login', '/register'])('sends a live session away from %s to /', (path) => {
    const response = proxy(visit(path, makeToken(nowSeconds() + 600)));

    expect(redirectTarget(response)).toEqual({ pathname: '/', params: {} });
  });

  it.each(['/login', '/register'])('shows %s when the cookie is missing or expired', (path) => {
    expect(isPassThrough(proxy(visit(path)))).toBe(true);
    expect(isPassThrough(proxy(visit(path, makeToken(nowSeconds() - 1))))).toBe(true);
  });
});
