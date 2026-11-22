import { describe, expect, it, vi } from 'vitest';
import {
  createTwelveDataClient,
  ProviderError,
  ProviderNotFoundError,
  ProviderRateLimitError,
} from '../src/providers/twelve-data/index.js';

const API_KEY = 'test-api-key-not-real';

/** Shape documented by Twelve Data for GET /quote (numbers as strings). */
function rawQuote(symbol: string, overrides: Record<string, unknown> = {}) {
  return {
    symbol,
    name: 'Apple Inc',
    exchange: 'NASDAQ',
    mic_code: 'XNAS',
    currency: 'USD',
    datetime: '2026-11-20',
    timestamp: 1_763_596_800,
    last_quote_at: 1_763_672_340,
    open: '228.10000',
    high: '230.50000',
    low: '227.00000',
    close: '229.87000',
    volume: '41234567',
    previous_close: '227.50000',
    change: '2.37000',
    percent_change: '1.04176',
    average_volume: '50000000',
    is_market_open: false,
    fifty_two_week: {
      low: '164.08000',
      high: '237.49000',
      low_change: '65.79',
      high_change: '-7.62',
      low_change_percent: '40.1',
      high_change_percent: '-3.2',
      range: '164.08 - 237.49',
    },
    ...overrides,
  };
}

const rateLimitBody = {
  code: 429,
  message: 'You have run out of API credits for the current minute.',
  status: 'error',
};
const notFoundBody = {
  code: 404,
  message: '**symbol** not found: ZZZZ. Please specify it correctly.',
  status: 'error',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clientAnswering(...responses: (Response | Error)[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  const client = createTwelveDataClient({
    apiKey: API_KEY,
    baseUrl: 'https://api.twelvedata.test',
    fetch: fetchMock,
  });
  const requestedUrl = (call = 0): URL => new URL(String(fetchMock.mock.calls[call]?.[0]));
  return { client, fetchMock, requestedUrl };
}

describe('Twelve Data client', () => {
  describe('getQuotes', () => {
    it('maps a single quote to our type, with numbers and asOf from last_quote_at', async () => {
      const { client, requestedUrl } = clientAnswering(jsonResponse(rawQuote('AAPL')));

      const outcomes = await client.getQuotes(['AAPL']);

      expect(outcomes.get('AAPL')).toEqual({
        ok: true,
        quote: {
          symbol: 'AAPL',
          name: 'Apple Inc',
          exchange: 'NASDAQ',
          currency: 'USD',
          price: 229.87,
          change: 2.37,
          changePercent: 1.04176,
          open: 228.1,
          high: 230.5,
          low: 227,
          previousClose: 227.5,
          volume: 41_234_567,
          fiftyTwoWeek: { low: 164.08, high: 237.49 },
          isMarketOpen: false,
          asOf: new Date(1_763_672_340 * 1000).toISOString(),
        },
      });
      const url = requestedUrl();
      expect(url.pathname).toBe('/quote');
      expect(url.searchParams.get('symbol')).toBe('AAPL');
      expect(url.searchParams.get('apikey')).toBe(API_KEY);
    });

    it.each([
      ['omits', undefined],
      ['sends null for', null],
    ])(
      'falls back to timestamp for asOf and to null volume when the provider %s them',
      async (_case, missing) => {
        const raw = rawQuote('SPY', { last_quote_at: missing, volume: missing });
        const { client } = clientAnswering(jsonResponse(raw));

        const outcome = (await client.getQuotes(['SPY'])).get('SPY');

        expect(outcome).toMatchObject({
          ok: true,
          quote: { asOf: new Date(1_763_596_800 * 1000).toISOString(), volume: null },
        });
      },
    );

    it('treats each symbol of a batch separately when one of them fails', async () => {
      const { client, requestedUrl } = clientAnswering(
        jsonResponse({ AAPL: rawQuote('AAPL'), ZZZZ: notFoundBody, MSFT: rateLimitBody }),
      );

      const outcomes = await client.getQuotes(['AAPL', 'ZZZZ', 'MSFT']);

      expect(requestedUrl().searchParams.get('symbol')).toBe('AAPL,ZZZZ,MSFT');
      expect(outcomes.get('AAPL')).toMatchObject({ ok: true, quote: { symbol: 'AAPL' } });
      expect(outcomes.get('ZZZZ')).toMatchObject({ ok: false });
      expect((outcomes.get('ZZZZ') as { error: Error }).error).toBeInstanceOf(
        ProviderNotFoundError,
      );
      expect((outcomes.get('MSFT') as { error: Error }).error).toBeInstanceOf(
        ProviderRateLimitError,
      );
    });

    it('marks a batch entry that does not validate as a provider error without failing the rest', async () => {
      const { client } = clientAnswering(
        jsonResponse({ AAPL: rawQuote('AAPL'), MSFT: rawQuote('MSFT', { close: 'n/a' }) }),
      );

      const outcomes = await client.getQuotes(['AAPL', 'MSFT']);

      expect(outcomes.get('AAPL')?.ok).toBe(true);
      const failed = outcomes.get('MSFT');
      expect(failed?.ok).toBe(false);
      expect((failed as { error: Error }).error).toBeInstanceOf(ProviderError);
      expect((failed as { error: Error }).error).not.toBeInstanceOf(ProviderNotFoundError);
    });

    it('detects the rate limit from the HTTP status (429)', async () => {
      const { client } = clientAnswering(new Response('Too Many Requests', { status: 429 }));

      await expect(client.getQuotes(['AAPL'])).rejects.toBeInstanceOf(ProviderRateLimitError);
    });

    it('detects the rate limit from code 429 in a 200 body', async () => {
      const { client } = clientAnswering(jsonResponse(rateLimitBody, 200));

      await expect(client.getQuotes(['AAPL', 'MSFT'])).rejects.toBeInstanceOf(
        ProviderRateLimitError,
      );
    });

    it('reports an unknown single symbol as not found (code 404 in a 200 body)', async () => {
      const { client } = clientAnswering(jsonResponse(notFoundBody, 200));

      const outcome = (await client.getQuotes(['ZZZZ'])).get('ZZZZ');

      expect(outcome?.ok).toBe(false);
      expect((outcome as { error: Error }).error).toBeInstanceOf(ProviderNotFoundError);
    });

    it('reports code 400 (invalid symbol) as not found too', async () => {
      const { client } = clientAnswering(
        jsonResponse({ code: 400, message: 'symbol is invalid', status: 'error' }, 400),
      );

      const outcome = (await client.getQuotes(['ZZZZ'])).get('ZZZZ');

      expect((outcome as { error: Error }).error).toBeInstanceOf(ProviderNotFoundError);
    });

    it('fails with ProviderError for other provider errors such as an invalid key (401)', async () => {
      const { client } = clientAnswering(
        jsonResponse(
          { code: 401, message: '**apikey** parameter is incorrect', status: 'error' },
          401,
        ),
      );

      const error = await client.getQuotes(['AAPL']).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ProviderError);
      expect(error).not.toBeInstanceOf(ProviderNotFoundError);
      expect(error).not.toBeInstanceOf(ProviderRateLimitError);
      // Nothing was served, so the reserved credit can be given back.
      expect((error as ProviderError).refundable).toBe(true);
    });

    it('never reads a bare HTTP 404 (no Twelve Data body) as "not found"', async () => {
      const { client } = clientAnswering(new Response('Not Found', { status: 404 }));

      const error = await client.getQuotes(['AAPL']).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ProviderError);
      expect(error).not.toBeInstanceOf(ProviderNotFoundError);
    });

    it('treats a request-level "not found" for a multi-symbol batch as a provider error', async () => {
      const { client } = clientAnswering(jsonResponse(notFoundBody, 200));

      const error = await client.getQuotes(['AAPL', 'ZZZZ']).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ProviderError);
      expect(error).not.toBeInstanceOf(ProviderNotFoundError);
    });

    it('names the failing fields in the internal message, never their values', async () => {
      const { client } = clientAnswering(
        jsonResponse(rawQuote('AAPL', { close: 'secret-looking-value', currency: null })),
      );

      const outcome = (await client.getQuotes(['AAPL'])).get('AAPL');
      const message = (outcome as { error: Error }).error.message;

      expect(message).toContain('close');
      expect(message).toContain('currency');
      expect(message).not.toContain('secret-looking-value');
    });

    it('fails with ProviderError when a single quote does not validate', async () => {
      const { client } = clientAnswering(jsonResponse({ symbol: 'AAPL', close: '1' }));

      const outcome = (await client.getQuotes(['AAPL'])).get('AAPL');

      expect(outcome?.ok).toBe(false);
      expect((outcome as { error: Error }).error).toBeInstanceOf(ProviderError);
    });

    it('fails with ProviderError on a non-JSON body', async () => {
      const { client } = clientAnswering(new Response('<html>Bad gateway</html>', { status: 200 }));

      await expect(client.getQuotes(['AAPL'])).rejects.toBeInstanceOf(ProviderError);
    });

    describe('which failures give the credit back', () => {
      const failureOf = async (response: Response, symbols = ['AAPL']) => {
        const { client } = clientAnswering(response);
        try {
          const outcomes = await client.getQuotes(symbols);
          const failed = [...outcomes.values()].find((outcome) => !outcome.ok);
          return failed && !failed.ok ? failed.error : null;
        } catch (error) {
          return error as ProviderError;
        }
      };

      it.each<[string, () => Response, string[]]>([
        [
          'a 2xx quote that does not validate',
          () => jsonResponse(rawQuote('AAPL', { close: 'x' })),
          ['AAPL'],
        ],
        ['a 2xx non-JSON body', () => new Response('<html></html>', { status: 200 }), ['AAPL']],
        ['a 2xx batch with an unexpected shape', () => jsonResponse(['nope']), ['AAPL', 'MSFT']],
        [
          'a symbol missing from a served batch',
          () => jsonResponse({ AAPL: rawQuote('AAPL') }),
          ['AAPL', 'MSFT'],
        ],
      ])('keeps it for %s (served, hence charged)', async (_case, response, symbols) => {
        const error = await failureOf(response(), symbols);

        expect(error).toBeInstanceOf(ProviderError);
        expect(error?.refundable).toBe(false);
        expect(error?.affectsAllRequests).toBe(false);
      });

      it.each<[string, () => Response, boolean]>([
        [
          'code 401 in the body (invalid key)',
          () => jsonResponse({ code: 401, message: 'bad key', status: 'error' }),
          true,
        ],
        [
          'code 403 in the body (plan restriction)',
          () => jsonResponse({ code: 403, message: 'plan', status: 'error' }),
          false,
        ],
        [
          'code 500 in the body',
          () => jsonResponse({ code: 500, message: 'oops', status: 'error' }),
          true,
        ],
        [
          'a bare HTTP 503 with a non-JSON body',
          () => new Response('<html>503</html>', { status: 503 }),
          true,
        ],
      ])('refunds it for %s', async (_case, response, providerWide) => {
        const error = await failureOf(response());

        expect(error?.refundable).toBe(true);
        expect(error?.affectsAllRequests).toBe(providerWide);
      });
    });

    it('turns a timeout into ProviderError without exposing the URL or the key', async () => {
      const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      const { client } = clientAnswering(timeout);

      const error = await client.getQuotes(['AAPL']).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ProviderError);
      expect((error as Error).message).toBe('Twelve Data request timed out');
      expect((error as Error).message).not.toContain(API_KEY);
      // The provider may have processed it: the credit is not given back.
      expect((error as ProviderError).refundable).toBe(false);
    });

    it('turns a network failure into ProviderError whose message never contains the key', async () => {
      const { client } = clientAnswering(new TypeError(`fetch failed for ?apikey=${API_KEY}`));

      const error = await client.getQuotes(['AAPL']).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ProviderError);
      expect((error as Error).message).not.toContain(API_KEY);
      expect((error as ProviderError).refundable).toBe(true);
      // Unreachable affects every call: it trips the market service's cooldown.
      expect((error as ProviderError).affectsAllRequests).toBe(true);
    });
  });

  describe('searchSymbols', () => {
    it('maps the search payload and asks for 30 matches', async () => {
      const { client, requestedUrl } = clientAnswering(
        jsonResponse({
          data: [
            {
              symbol: 'AAPL',
              instrument_name: 'Apple Inc',
              exchange: 'NASDAQ',
              mic_code: 'XNGS',
              exchange_timezone: 'America/New_York',
              instrument_type: 'Common Stock',
              country: 'United States',
              currency: 'USD',
            },
            {
              symbol: 'APPC/USD',
              instrument_name: 'AppCoins US Dollar',
              exchange: 'Synthetic',
              mic_code: null,
              instrument_type: 'Digital Currency',
              country: null,
            },
            // Invalid rows are dropped instead of failing the whole search.
            { symbol: '', instrument_name: 'No symbol', exchange: 'NYSE', instrument_type: 'ETF' },
            { symbol: 'NONAME', exchange: 'NYSE', instrument_type: 'ETF' },
          ],
          status: 'ok',
        }),
      );

      const matches = await client.searchSymbols('app');

      expect(matches).toEqual([
        {
          symbol: 'AAPL',
          name: 'Apple Inc',
          exchange: 'NASDAQ',
          micCode: 'XNGS',
          type: 'Common Stock',
          country: 'United States',
        },
        {
          symbol: 'APPC/USD',
          name: 'AppCoins US Dollar',
          exchange: 'Synthetic',
          micCode: '',
          type: 'Digital Currency',
          country: '',
        },
      ]);
      expect(requestedUrl().pathname).toBe('/symbol_search');
      expect(requestedUrl().searchParams.get('symbol')).toBe('app');
      expect(requestedUrl().searchParams.get('outputsize')).toBe('30');
    });

    it('fails with ProviderError when the payload does not validate', async () => {
      const { client } = clientAnswering(jsonResponse({ data: 'nope', status: 'ok' }));

      await expect(client.searchSymbols('app')).rejects.toBeInstanceOf(ProviderError);
    });

    it('fails with ProviderError when no row validates, so an empty list is never cached', async () => {
      const { client } = clientAnswering(jsonResponse({ data: [{ symbol: 1 }], status: 'ok' }));

      await expect(client.searchSymbols('app')).rejects.toBeInstanceOf(ProviderError);
    });

    it('returns an empty list for a genuine search without matches', async () => {
      const { client } = clientAnswering(jsonResponse({ data: [], status: 'ok' }));

      await expect(client.searchSymbols('zzzzzz')).resolves.toEqual([]);
    });
  });

  describe('getTimeSeries', () => {
    it('requests UTC, converts datetimes to ISO and sorts points ascending', async () => {
      const { client, requestedUrl } = clientAnswering(
        jsonResponse({
          meta: { symbol: 'AAPL', interval: '5min', exchange_timezone: 'America/New_York' },
          values: [
            {
              datetime: '2026-11-20 20:55:00',
              open: '1',
              high: '1',
              low: '1',
              close: '229.87',
              volume: '1',
            },
            {
              datetime: '2026-11-20 20:50:00',
              open: '1',
              high: '1',
              low: '1',
              close: '229.10',
              volume: '1',
            },
          ],
          status: 'ok',
        }),
      );

      const series = await client.getTimeSeries('AAPL', { interval: '5min', outputsize: 78 });

      expect(series).toEqual({
        symbol: 'AAPL',
        points: [
          { t: '2026-11-20T20:50:00.000Z', close: 229.1 },
          { t: '2026-11-20T20:55:00.000Z', close: 229.87 },
        ],
      });
      const url = requestedUrl();
      expect(url.pathname).toBe('/time_series');
      expect(url.searchParams.get('timezone')).toBe('UTC');
      expect(url.searchParams.get('interval')).toBe('5min');
      expect(url.searchParams.get('outputsize')).toBe('78');
    });

    it('maps daily bars (date only) to 00:00Z of that date', async () => {
      const { client } = clientAnswering(
        jsonResponse({
          meta: { symbol: 'AAPL' },
          values: [{ datetime: '2026-11-20', close: '229.87' }],
          status: 'ok',
        }),
      );

      const series = await client.getTimeSeries('AAPL', { interval: '1day', outputsize: 22 });

      expect(series.points).toEqual([{ t: '2026-11-20T00:00:00.000Z', close: 229.87 }]);
    });

    it('drops invalid points (impossible date, unreadable close) and keeps the rest', async () => {
      const { client } = clientAnswering(
        jsonResponse({
          meta: { symbol: 'AAPL' },
          values: [
            { datetime: '2026-11-20', close: '229.87' },
            { datetime: '2026-13-45', close: '1' },
            { datetime: '2026-11-19', close: 'n/a' },
          ],
        }),
      );

      const series = await client.getTimeSeries('AAPL', { interval: '1day', outputsize: 22 });

      expect(series.points).toEqual([{ t: '2026-11-20T00:00:00.000Z', close: 229.87 }]);
    });

    it('fails with ProviderError when no point is valid', async () => {
      const { client } = clientAnswering(
        jsonResponse({
          meta: { symbol: 'AAPL' },
          values: [{ datetime: '2026-13-45', close: '1' }],
        }),
      );

      await expect(
        client.getTimeSeries('AAPL', { interval: '1day', outputsize: 22 }),
      ).rejects.toBeInstanceOf(ProviderError);
    });

    it('detects the rate limit from code 429 in the body', async () => {
      const { client } = clientAnswering(jsonResponse(rateLimitBody));

      await expect(
        client.getTimeSeries('AAPL', { interval: '1day', outputsize: 22 }),
      ).rejects.toBeInstanceOf(ProviderRateLimitError);
    });

    it('rejects an unknown symbol with ProviderNotFoundError', async () => {
      const { client } = clientAnswering(jsonResponse(notFoundBody, 404));

      await expect(
        client.getTimeSeries('ZZZZ', { interval: '1day', outputsize: 22 }),
      ).rejects.toBeInstanceOf(ProviderNotFoundError);
    });
  });
});
