import { vi } from 'vitest';

export const API_URL = 'http://api.test';
export const COOKIE_NAME = 'ruut_session';

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** An unsigned-looking JWT whose payload carries `exp`; proxy and session never verify it. */
export function makeToken(expSeconds: number): string {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const payload = base64Url({ sub: 'user-1', email: 'ada@example.com', exp: expSeconds });
  return `${header}.${payload}.signature`;
}

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export function stubServerEnv(overrides: Record<string, string> = {}): void {
  vi.stubEnv('API_INTERNAL_URL', API_URL);
  vi.stubEnv('SESSION_COOKIE_NAME', COOKIE_NAME);
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

/** Replaces global fetch and returns the mock so tests can inspect the forwarded request. */
export function mockFetch(...responses: Array<Response | Error>) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Headers and URL of the n-th call to the mocked fetch. */
export function forwardedRequest(fetchMock: ReturnType<typeof mockFetch>, index = 0) {
  const call = fetchMock.mock.calls[index];
  if (!call) throw new Error(`fetch was not called ${index + 1} time(s)`);
  const [input, init] = call;
  return {
    url: String(input),
    method: init?.method,
    headers: new Headers(init?.headers),
    body: init?.body,
  };
}
