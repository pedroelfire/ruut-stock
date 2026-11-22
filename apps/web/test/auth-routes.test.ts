import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as demo } from '@/app/api/auth/demo/route';
import { GET as expired } from '@/app/api/auth/expired/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { POST as register } from '@/app/api/auth/register/route';
import {
  API_URL,
  COOKIE_NAME,
  forwardedRequest,
  jsonResponse,
  makeToken,
  mockFetch,
  nowSeconds,
  stubServerEnv,
} from './helpers';

const user = { id: 'user-1', email: 'ada@example.com' };
const CROSS_SITE = { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' };

function authRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('POST /api/auth/login', () => {
  beforeEach(() => stubServerEnv());

  it('stores the token in an httpOnly cookie whose maxAge follows the JWT exp', async () => {
    const token = makeToken(nowSeconds() + 3600);
    mockFetch(jsonResponse({ data: { token, user } }));

    const response = await login(
      authRequest('/api/auth/login', { email: user.email, password: 'secret-pass' }),
    );

    expect(response.status).toBe(200);
    const cookie = response.cookies.get(COOKIE_NAME);
    expect(cookie?.value).toBe(token);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
    expect(cookie?.path).toBe('/');
    // A couple of seconds of slack for the time the test takes.
    expect(cookie?.maxAge).toBeGreaterThan(3590);
    expect(cookie?.maxAge).toBeLessThanOrEqual(3600);
  });

  it('never returns the token in the body', async () => {
    const token = makeToken(nowSeconds() + 3600);
    mockFetch(jsonResponse({ data: { token, user } }));

    const response = await login(
      authRequest('/api/auth/login', { email: user.email, password: 'secret-pass' }),
    );
    const text = await response.text();

    expect(JSON.parse(text)).toEqual({ data: { user } });
    expect(text).not.toContain(token);
  });

  it('marks the cookie secure only in production', async () => {
    stubServerEnv({ NODE_ENV: 'production' });
    mockFetch(jsonResponse({ data: { token: makeToken(nowSeconds() + 60), user } }));

    const response = await login(
      authRequest('/api/auth/login', { email: user.email, password: 'secret-pass' }),
    );

    expect(response.cookies.get(COOKIE_NAME)?.secure).toBe(true);
  });

  it('forwards the body and only the last X-Forwarded-For entry to the API', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ data: { token: makeToken(nowSeconds() + 60), user } }),
    );
    const body = { email: user.email, password: 'secret-pass' };

    await login(
      authRequest('/api/auth/login', body, { 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }),
    );

    const forwarded = forwardedRequest(fetchMock);
    expect(forwarded.url).toBe(`${API_URL}/auth/login`);
    expect(forwarded.method).toBe('POST');
    expect(JSON.parse(String(forwarded.body))).toEqual(body);
    expect(forwarded.headers.get('x-forwarded-for')).toBe('203.0.113.7');
  });

  it('propagates API errors with their status, body and Retry-After, without a cookie', async () => {
    const error = {
      error: { code: 'RATE_LIMITED', message: 'Too many attempts.', retryAfter: 42 },
    };
    mockFetch(jsonResponse(error, { status: 429, headers: { 'retry-after': '42' } }));

    const response = await login(
      authRequest('/api/auth/login', { email: user.email, password: 'wrong-pass' }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('42');
    expect(await response.json()).toEqual(error);
    expect(response.cookies.get(COOKIE_NAME)).toBeUndefined();
  });

  it('answers 502 when the API is unreachable', async () => {
    mockFetch(new TypeError('fetch failed'));

    const response = await login(
      authRequest('/api/auth/login', { email: user.email, password: 'secret-pass' }),
    );

    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe('UPSTREAM_ERROR');
  });

  it('sets no cookie when the API token carries no future exp', async () => {
    mockFetch(jsonResponse({ data: { token: makeToken(nowSeconds() - 10), user } }));

    const response = await login(
      authRequest('/api/auth/login', { email: user.email, password: 'secret-pass' }),
    );

    expect(response.status).toBe(502);
    expect(response.cookies.get(COOKIE_NAME)).toBeUndefined();
  });
});

describe('POST /api/auth/register', () => {
  beforeEach(() => stubServerEnv());

  it('passes a 409 conflict through untouched', async () => {
    const error = { error: { code: 'CONFLICT', message: 'An account with this email exists' } };
    mockFetch(jsonResponse(error, { status: 409 }));

    const response = await register(
      authRequest('/api/auth/register', { email: user.email, password: 'secret-pass' }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(error);
  });

  it('keeps the 201 status of a new account', async () => {
    mockFetch(
      jsonResponse({ data: { token: makeToken(nowSeconds() + 60), user } }, { status: 201 }),
    );

    const response = await register(
      authRequest('/api/auth/register', { email: user.email, password: 'secret-pass' }),
    );

    expect(response.status).toBe(201);
    expect(response.cookies.get(COOKIE_NAME)?.value).toBeTruthy();
  });
});

describe('POST /api/auth/demo', () => {
  it('signs in with the server-side demo credentials', async () => {
    stubServerEnv({ DEMO_USER_EMAIL: 'demo@example.com', DEMO_USER_PASSWORD: 'demo-password' });
    const fetchMock = mockFetch(
      jsonResponse({ data: { token: makeToken(nowSeconds() + 60), user } }),
    );

    const response = await demo(
      new NextRequest('http://localhost:3000/api/auth/demo', { method: 'POST' }),
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(String(forwardedRequest(fetchMock).body))).toEqual({
      email: 'demo@example.com',
      password: 'demo-password',
    });
  });

  it('answers 500 INTERNAL_ERROR without calling the API when the demo account is not configured', async () => {
    stubServerEnv({ DEMO_USER_EMAIL: '', DEMO_USER_PASSWORD: '' });
    const fetchMock = mockFetch();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await demo(
      new NextRequest('http://localhost:3000/api/auth/demo', { method: 'POST' }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'The demo account is not available right now.' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('session teardown', () => {
  beforeEach(() => stubServerEnv());

  it('logout clears the cookie and answers 204', async () => {
    const response = logout(
      new NextRequest('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: { 'sec-fetch-site': 'same-origin' },
      }),
    );

    expect(response.status).toBe(204);
    const cookie = response.cookies.get(COOKIE_NAME);
    expect(cookie?.value).toBe('');
    expect(cookie?.maxAge).toBe(0);
  });

  it('expired clears the cookie and redirects to /login?expired=1', async () => {
    const response = expired();

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('/login?expired=1');
    expect(response.cookies.get(COOKIE_NAME)?.maxAge).toBe(0);
  });
});

describe('auth request guards', () => {
  beforeEach(() =>
    stubServerEnv({ DEMO_USER_EMAIL: 'demo@example.com', DEMO_USER_PASSWORD: 'demo-password' }),
  );

  const credentials = { email: user.email, password: 'secret-pass' };

  it.each([
    ['login', () => login(authRequest('/api/auth/login', credentials, CROSS_SITE))],
    ['register', () => register(authRequest('/api/auth/register', credentials, CROSS_SITE))],
    ['demo', () => demo(authRequest('/api/auth/demo', {}, CROSS_SITE))],
    ['logout', async () => logout(authRequest('/api/auth/logout', {}, CROSS_SITE))],
  ])('rejects a cross-site %s with 403 before calling the API', async (_name, send) => {
    const fetchMock = mockFetch();

    const response = await send();

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
    expect(response.cookies.get(COOKIE_NAME)).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to comparing Origin with the host when Sec-Fetch-Site is missing', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ data: { token: makeToken(nowSeconds() + 60), user } }),
    );

    const foreign = await demo(
      authRequest('/api/auth/demo', {}, { origin: 'https://evil.example' }),
    );
    const behindProxy = await demo(
      authRequest(
        '/api/auth/demo',
        {},
        { origin: 'https://stocks.example', 'x-forwarded-host': 'stocks.example' },
      ),
    );

    expect(foreign.status).toBe(403);
    expect(behindProxy.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lets same-origin requests through', async () => {
    mockFetch(jsonResponse({ data: { token: makeToken(nowSeconds() + 60), user } }));

    const response = await login(
      authRequest('/api/auth/login', credentials, {
        'sec-fetch-site': 'same-origin',
        origin: 'http://localhost:3000',
      }),
    );

    expect(response.status).toBe(200);
  });

  it('rejects a body that is not declared as JSON (text/plain form posts)', async () => {
    const fetchMock = mockFetch();
    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
      headers: { 'content-type': 'text/plain' },
    });

    const response = await login(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Request body must be JSON' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects bodies over 10 KB, declared or real, before calling the API', async () => {
    const fetchMock = mockFetch();
    const big = { ...credentials, padding: 'x'.repeat(11 * 1024) };

    const declared = await login(
      authRequest('/api/auth/login', credentials, { 'content-length': String(64 * 1024) }),
    );
    const real = await register(authRequest('/api/auth/register', big));

    expect(declared.status).toBe(400);
    expect(real.status).toBe(400);
    expect((await real.json()).error.message).toBe('Request body is too large');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
