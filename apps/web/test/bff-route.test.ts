import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { DELETE, GET, POST } from '@/app/api/bff/[...path]/route';
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

const token = makeToken(nowSeconds() + 3600);

function bffRequest(
  url: string,
  init: { method?: string; body?: string; headers?: Record<string, string>; cookie?: boolean } = {},
) {
  const { cookie = true, headers = {}, ...rest } = init;
  return new NextRequest(`http://localhost:3000/api/bff/${url}`, {
    ...rest,
    headers: { ...(cookie ? { cookie: `${COOKIE_NAME}=${token}` } : {}), ...headers },
  });
}

/** Next decodes each `[...path]` segment before handing it to the route. */
const context = (...path: string[]) => ({ params: Promise.resolve({ path }) });

describe('/api/bff/[...path]', () => {
  beforeEach(() => stubServerEnv());

  it.each([
    [['auth', 'me']],
    [['market']],
    [['watchlists']],
    [['health']],
    [['market', '..', 'auth', 'me']],
    [['watchlist', 'a/b']],
  ])('answers 404 for %j without calling the API', async (path) => {
    const fetchMock = mockFetch();

    const response = await GET(bffRequest(path.join('/')), context(...path));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('NOT_FOUND');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the Bearer token, the query string and the browser IP', async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [] }));

    const response = await GET(
      bffRequest('market/search?q=aapl', {
        headers: { 'x-forwarded-for': '6.6.6.6, 198.51.100.4', authorization: 'Bearer forged' },
      }),
      context('market', 'search'),
    );

    expect(response.status).toBe(200);
    const forwarded = forwardedRequest(fetchMock);
    expect(forwarded.url).toBe(`${API_URL}/market/search?q=aapl`);
    expect(forwarded.headers.get('authorization')).toBe(`Bearer ${token}`);
    // Overwritten with the edge-appended entry, not appended to the client-supplied list.
    expect(forwarded.headers.get('x-forwarded-for')).toBe('198.51.100.4');
    expect(forwarded.headers.get('cookie')).toBeNull();
  });

  it('relays status, body and Retry-After untouched', async () => {
    const error = { error: { code: 'RATE_LIMITED', message: 'Slow down', retryAfter: 30 } };
    mockFetch(jsonResponse(error, { status: 429, headers: { 'retry-after': '30' } }));

    const response = await GET(bffRequest('market/quote?symbols=AAPL'), context('market', 'quote'));

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(await response.json()).toEqual(error);
  });

  it('forwards POST bodies and DELETE paths', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ data: { symbol: 'AAPL' } }, { status: 201 }),
      new Response(null, { status: 204 }),
    );

    const created = await POST(
      bffRequest('watchlist', {
        method: 'POST',
        body: JSON.stringify({ symbol: 'AAPL' }),
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      }),
      context('watchlist'),
    );
    const removed = await DELETE(
      bffRequest('watchlist/BRK.B', { method: 'DELETE' }),
      context('watchlist', 'BRK.B'),
    );

    expect(created.status).toBe(201);
    expect(forwardedRequest(fetchMock, 0).body).toBe(JSON.stringify({ symbol: 'AAPL' }));
    expect(removed.status).toBe(204);
    expect(forwardedRequest(fetchMock, 1)).toMatchObject({
      url: `${API_URL}/watchlist/BRK.B`,
      method: 'DELETE',
    });
  });

  it('clears the session cookie when the API answers 401', async () => {
    mockFetch(
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 }),
    );

    const response = await GET(bffRequest('watchlist'), context('watchlist'));

    expect(response.status).toBe(401);
    expect(response.cookies.get(COOKIE_NAME)?.maxAge).toBe(0);
  });

  it('keeps the cookie on other errors', async () => {
    mockFetch(
      jsonResponse({ error: { code: 'UPSTREAM_ERROR', message: 'Down' } }, { status: 502 }),
    );

    const response = await GET(bffRequest('watchlist'), context('watchlist'));

    expect(response.status).toBe(502);
    expect(response.cookies.get(COOKIE_NAME)).toBeUndefined();
  });

  it('answers 401 without calling the API when there is no cookie', async () => {
    const fetchMock = mockFetch();

    const response = await GET(bffRequest('watchlist', { cookie: false }), context('watchlist'));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', POST, 'watchlist'],
    ['DELETE', DELETE, 'watchlist/AAPL'],
  ] as const)(
    'rejects a cross-site %s with 403 before calling the API',
    async (method, handler, url) => {
      const fetchMock = mockFetch();

      const response = await handler(
        bffRequest(url, {
          method,
          body: method === 'POST' ? JSON.stringify({ symbol: 'AAPL' }) : undefined,
          headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
        }),
        context(...url.split('/')),
      );

      expect(response.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rejects a POST whose body is not declared as JSON', async () => {
    const fetchMock = mockFetch();

    const response = await POST(
      bffRequest('watchlist', {
        method: 'POST',
        body: JSON.stringify({ symbol: 'AAPL' }),
        headers: { 'content-type': 'text/plain' },
      }),
      context('watchlist'),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
