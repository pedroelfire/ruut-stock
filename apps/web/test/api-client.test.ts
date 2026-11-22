import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiRequest, apiSend } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { jsonResponse, mockFetch } from './helpers';

const schema = z.object({ data: z.object({ symbol: z.string() }) });

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof ApiError)) throw new Error(`Expected ApiError, got ${String(error)}`);
  return error;
}

describe('apiRequest', () => {
  it('returns the parsed body on success', async () => {
    mockFetch(jsonResponse({ data: { symbol: 'AAPL' } }));

    await expect(apiRequest('/api/bff/watchlist', schema)).resolves.toEqual({
      data: { symbol: 'AAPL' },
    });
  });

  it('maps an API error body to ApiError with code, message, status and retryAfter', async () => {
    mockFetch(
      jsonResponse(
        { error: { code: 'RATE_LIMITED', message: 'Too many requests.', retryAfter: 42 } },
        { status: 429 },
      ),
    );

    const error = await captureError(apiRequest('/api/bff/market/quote', schema));

    expect(error).toMatchObject({
      code: 'RATE_LIMITED',
      message: 'Too many requests.',
      status: 429,
      retryAfter: 42,
    });
  });

  it('falls back to the Retry-After header when the body has no retryAfter', async () => {
    mockFetch(
      jsonResponse(
        { error: { code: 'RATE_LIMITED', message: 'Too many requests.' } },
        { status: 429, headers: { 'retry-after': '17' } },
      ),
    );

    const error = await captureError(apiRequest('/api/bff/market/quote', schema));

    expect(error.retryAfter).toBe(17);
  });

  it('infers the code from the status when the error body is not the API format', async () => {
    mockFetch(new Response('<html>Bad gateway</html>', { status: 502 }));

    const error = await captureError(apiRequest('/api/bff/watchlist', schema));

    expect(error).toMatchObject({ code: 'UPSTREAM_ERROR', status: 502 });
    expect(error.message).not.toContain('html');
  });

  it('rejects a 2xx response that does not match the schema', async () => {
    mockFetch(jsonResponse({ data: { ticker: 'AAPL' } }));

    const error = await captureError(apiRequest('/api/bff/watchlist', schema));

    expect(error).toMatchObject({ code: 'INTERNAL_ERROR', status: 200 });
  });

  it('turns a network failure into ApiError with status 0', async () => {
    mockFetch(new TypeError('Failed to fetch'));

    const error = await captureError(apiRequest('/api/bff/watchlist', schema));

    expect(error).toMatchObject({ code: 'UPSTREAM_ERROR', status: 0 });
  });

  it('rethrows aborts untouched so cancelled requests are not reported as failures', async () => {
    mockFetch(new DOMException('The operation was aborted.', 'AbortError'));

    await expect(apiRequest('/api/bff/market/search?q=a', schema)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('sends JSON bodies with their content type', async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }));

    await apiSend('/api/bff/watchlist', { method: 'POST', body: { symbol: 'AAPL' } });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ symbol: 'AAPL' }));
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
  });
});
