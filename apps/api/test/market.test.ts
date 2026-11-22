import { quoteResponseSchema, searchResponseSchema, seriesResponseSchema } from '@ruut/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { MarketConfig } from '../src/app.js';
import {
  ProviderError,
  ProviderNotFoundError,
  ProviderRateLimitError,
  type SymbolMatch,
} from '../src/providers/twelve-data/index.js';
import {
  bearerFor,
  createTestApp,
  FakeMarketDataProvider,
  makeQuote,
  ManualClock,
} from './helpers.js';

const MINUTE = 60_000;
const AUTH = bearerFor('user-1');

function setup(options: { symbols?: string[]; market?: Partial<MarketConfig> } = {}) {
  const provider = new FakeMarketDataProvider(
    options.symbols ?? ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN'],
  );
  // 15:00:20 UTC: 40 seconds left in the current credit window.
  const clock = new ManualClock(Date.UTC(2026, 10, 20, 15, 0, 20));
  const { app } = createTestApp(undefined, {
    marketDataProvider: provider,
    clock: clock.now,
    ...(options.market && { market: options.market }),
  });
  const get = (path: string) => request(app).get(path).set('Authorization', AUTH);
  return { app, provider, clock, get };
}

describe('GET /market/quote', () => {
  describe('case table (spec 02 §4)', () => {
    it('200 with every quote when all symbols have data, each flagged fresh', async () => {
      const { get } = setup();

      const response = await get('/market/quote?symbols=AAPL,MSFT');

      expect(response.status).toBe(200);
      const body = quoteResponseSchema.parse(response.body);
      expect(body.data.map((quote) => [quote.symbol, quote.stale])).toEqual([
        ['AAPL', false],
        ['MSFT', false],
      ]);
      expect(body.meta).toBeUndefined();
    });

    it('200 with the quotes that fit and meta.partial when credits run short', async () => {
      const { get, provider } = setup({ market: { creditsPerMinute: 3 } });

      const response = await get('/market/quote?symbols=AAPL,MSFT,NVDA,TSLA,AMZN');

      expect(response.status).toBe(200);
      const body = quoteResponseSchema.parse(response.body);
      expect(body.data.map((quote) => quote.symbol)).toEqual(['AAPL', 'MSFT', 'NVDA']);
      expect(body.meta).toEqual({ partial: true, retryAfter: 40 });
      expect(provider.quoteCalls).toEqual([['AAPL', 'MSFT', 'NVDA']]);
    });

    it('429 with retryAfter when no symbol has data for lack of credits', async () => {
      const { get, provider } = setup({ market: { creditsPerMinute: 2 } });
      await get('/market/quote?symbols=MSFT,NVDA').expect(200);

      const response = await get('/market/quote?symbols=AAPL');

      expect(response.status).toBe(429);
      expect(response.body.error).toMatchObject({ code: 'RATE_LIMITED', retryAfter: 40 });
      expect(response.headers['retry-after']).toBe('40');
      expect(provider.quoteCalls).toHaveLength(1);
    });

    it('404 when every symbol is unknown to the provider', async () => {
      const { get } = setup();

      const response = await get('/market/quote?symbols=ZZZZ,QQQQX');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('200 with the existing symbols when mixed with unknown ones, which are omitted', async () => {
      const { get } = setup();

      const response = await get('/market/quote?symbols=AAPL,ZZZZ');

      expect(response.status).toBe(200);
      const body = quoteResponseSchema.parse(response.body);
      expect(body.data.map((quote) => quote.symbol)).toEqual(['AAPL']);
      expect(body.meta).toBeUndefined();
    });

    it('429 (not 404) when nothing has data: some unknown, the rest without credits', async () => {
      const { get } = setup({ market: { creditsPerMinute: 1 } });

      // ZZZZ takes the only credit and is unknown; AAPL gets no credit.
      const response = await get('/market/quote?symbols=ZZZZ,AAPL');

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('RATE_LIMITED');
    });
  });

  it('serves a repeated quote from the cache without spending credits', async () => {
    const { get, provider } = setup();

    await get('/market/quote?symbols=AAPL').expect(200);
    await get('/market/quote?symbols=AAPL').expect(200);

    expect(provider.creditsSpent).toBe(1);
  });

  it('only asks the provider for the symbols that are not fresh in the cache', async () => {
    const { get, provider } = setup();
    await get('/market/quote?symbols=AAPL').expect(200);

    await get('/market/quote?symbols=AAPL,MSFT').expect(200);

    expect(provider.quoteCalls).toEqual([['AAPL'], ['MSFT']]);
  });

  it('keeps a closed-market quote for 15 minutes and an open-market one for 2', async () => {
    const { get, provider, clock } = setup();
    provider.knownSymbols.set('MSFT', makeQuote('MSFT', { isMarketOpen: false }));
    await get('/market/quote?symbols=AAPL,MSFT').expect(200);

    clock.advance(10 * MINUTE);
    await get('/market/quote?symbols=AAPL,MSFT').expect(200);

    expect(provider.quoteCalls).toEqual([['AAPL', 'MSFT'], ['AAPL']]);
  });

  it('serves the cached quote with stale: true when the provider answers 429', async () => {
    const { get, provider, clock } = setup();
    await get('/market/quote?symbols=AAPL').expect(200);
    clock.advance(2 * MINUTE);
    provider.failWith = new ProviderRateLimitError();

    const response = await get('/market/quote?symbols=AAPL');

    expect(response.status).toBe(200);
    const body = quoteResponseSchema.parse(response.body);
    expect(body.data[0]).toMatchObject({ symbol: 'AAPL', stale: true });
    expect(body.meta?.partial).toBe(true);
  });

  it('stops calling the provider for the rest of the minute after a real 429', async () => {
    const { get, provider } = setup();
    provider.failWith = new ProviderRateLimitError();
    await get('/market/quote?symbols=AAPL').expect(429);

    const response = await get('/market/quote?symbols=MSFT');

    expect(response.status).toBe(429);
    expect(provider.quoteCalls).toEqual([['AAPL']]);
  });

  it('502 with a generic message when the provider fails and nothing is cached', async () => {
    const { get, provider } = setup();
    provider.failWith = new ProviderError(
      'Twelve Data error 401: **apikey** parameter is incorrect',
    );

    const response = await get('/market/quote?symbols=AAPL');

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('UPSTREAM_ERROR');
    expect(response.body.error.message).not.toContain('apikey');
  });

  it('serves stale data with stale: true and no meta when the provider fails for other reasons', async () => {
    const { get, provider, clock } = setup();
    await get('/market/quote?symbols=AAPL').expect(200);
    clock.advance(2 * MINUTE);
    provider.failWith = new ProviderError('timeout');

    const response = await get('/market/quote?symbols=AAPL');

    expect(response.status).toBe(200);
    expect(response.body.data[0].stale).toBe(true);
    expect(response.body.meta).toBeUndefined();
  });

  it('gives the credit back when the provider rejects without serving data', async () => {
    const { get, provider } = setup({ market: { creditsPerMinute: 1 } });
    // A plan restriction (403): not charged, and not provider-wide, so no cooldown either.
    provider.failWith = new ProviderError('Twelve Data error 403: plan', { refundable: true });

    await get('/market/quote?symbols=AAPL').expect(502);
    const second = await get('/market/quote?symbols=AAPL');

    // The rejected call did not drain the local budget: the second one still reaches the provider.
    expect(second.status).toBe(502);
    expect(provider.quoteCalls).toHaveLength(2);
  });

  it('keeps the credit spent for a served quote that does not validate', async () => {
    const { get, provider } = setup({ market: { creditsPerMinute: 1 } });
    // What the client returns for a 2xx entry that fails the schema: served, hence charged.
    provider.symbolErrors.set(
      'AAPL',
      new ProviderError('Unexpected Twelve Data quote payload (invalid: close)', {
        refundable: false,
      }),
    );

    await get('/market/quote?symbols=AAPL').expect(502);
    const second = await get('/market/quote?symbols=AAPL');

    // No refund-and-retry loop: the second request stays within the 1-credit budget.
    expect(second.status).toBe(429);
    expect(provider.quoteCalls).toHaveLength(1);
  });

  describe('provider cooldown after a provider-wide failure', () => {
    const outage = () =>
      new ProviderError('Twelve Data HTTP 503', { refundable: true, affectsAllRequests: true });

    it('stops calling the provider for 30 s, serving stale data or 502 meanwhile', async () => {
      const { get, provider, clock } = setup();
      await get('/market/quote?symbols=AAPL').expect(200);
      clock.advance(2 * MINUTE);
      provider.failWith = outage();

      // The first failing call trips the cooldown.
      await get('/market/quote?symbols=MSFT').expect(502);
      const staleQuote = await get('/market/quote?symbols=AAPL');
      const series = await get('/market/series/AAPL');

      expect(staleQuote.status).toBe(200);
      expect(staleQuote.body.data[0].stale).toBe(true);
      expect(staleQuote.body.meta).toBeUndefined();
      expect(series.status).toBe(502);
      expect(series.body.error.code).toBe('UPSTREAM_ERROR');
      expect(provider.quoteCalls).toEqual([['AAPL'], ['MSFT']]);
      expect(provider.seriesCalls).toHaveLength(0);
    });

    it('calls the provider again once the 30 s are over', async () => {
      const { get, provider, clock } = setup();
      provider.failWith = outage();
      await get('/market/quote?symbols=AAPL').expect(502);

      clock.advance(30_000 - 1);
      await get('/market/quote?symbols=AAPL').expect(502);
      expect(provider.quoteCalls).toHaveLength(1);

      clock.advance(1);
      provider.failWith = null;
      await get('/market/quote?symbols=AAPL').expect(200);
      expect(provider.quoteCalls).toHaveLength(2);
    });

    it('does not trip on a failure specific to one request (403 plan restriction)', async () => {
      const { get, provider } = setup();
      provider.failWith = new ProviderError('Twelve Data error 403: plan', { refundable: true });

      await get('/market/quote?symbols=AAPL').expect(502);
      await get('/market/quote?symbols=MSFT').expect(502);

      expect(provider.quoteCalls).toEqual([['AAPL'], ['MSFT']]);
    });
  });

  it('keeps the credit spent when the provider may have charged it (timeout)', async () => {
    const { get, provider } = setup({ market: { creditsPerMinute: 1 } });
    provider.failWith = new ProviderError('Twelve Data request timed out', { refundable: false });

    await get('/market/quote?symbols=AAPL').expect(502);
    const second = await get('/market/quote?symbols=AAPL');

    expect(second.status).toBe(429);
    expect(provider.quoteCalls).toHaveLength(1);
  });

  it('remembers an unknown symbol for 15 minutes, so repeated visits spend no credit', async () => {
    const { get, provider, clock } = setup();

    await get('/market/quote?symbols=ZZZZ').expect(404);
    clock.advance(15 * MINUTE - 1);
    await get('/market/quote?symbols=ZZZZ').expect(404);
    expect(provider.quoteCalls).toEqual([['ZZZZ']]);

    clock.advance(1);
    await get('/market/quote?symbols=ZZZZ').expect(404);
    expect(provider.quoteCalls).toEqual([['ZZZZ'], ['ZZZZ']]);
  });

  it('never serves an old quote for a symbol the provider now reports as unknown', async () => {
    const { get, provider, clock } = setup();
    await get('/market/quote?symbols=AAPL').expect(200);
    clock.advance(2 * MINUTE);
    provider.knownSymbols.delete('AAPL');

    const response = await get('/market/quote?symbols=AAPL');

    expect(response.status).toBe(404);
  });

  it('normalizes symbols (trim, uppercase, no duplicates) before calling the provider', async () => {
    const { get, provider } = setup();

    await get('/market/quote?symbols=%20aapl,AAPL,msft%20').expect(200);

    expect(provider.quoteCalls).toEqual([['AAPL', 'MSFT']]);
  });

  it.each([
    ['more than 8 symbols', 'A,B,C,D,E,F,G,H,I'],
    ['an empty list', ''],
    ['a symbol with invalid characters', 'AAPL,EUR/USD'],
  ])('400 VALIDATION_ERROR for %s', async (_case, symbols) => {
    const { get, provider } = setup();

    const response = await get(`/market/quote?symbols=${encodeURIComponent(symbols)}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(provider.quoteCalls).toHaveLength(0);
  });

  it('401 without a token', async () => {
    const { app } = setup();

    const response = await request(app).get('/market/quote?symbols=AAPL');

    expect(response.status).toBe(401);
  });
});

describe('GET /market/search', () => {
  const match = (symbol: string, overrides: Partial<SymbolMatch> = {}): SymbolMatch => ({
    symbol,
    name: `${symbol} Corp`,
    exchange: 'NASDAQ',
    micCode: 'XNGS',
    type: 'Common Stock',
    country: 'United States',
    ...overrides,
  });

  it('keeps US common stocks and ETFs on main exchanges, one row per symbol', async () => {
    const { get, provider } = setup();
    provider.searchMatches = [
      match('APP'),
      match('APP', { exchange: 'IEX', micCode: 'IEXG' }),
      match('APPB', { exchange: 'OTC', micCode: 'PINX' }),
      match('APPC', { type: 'ETF', exchange: 'CBOE', micCode: '' }),
      match('APP', { country: 'Mexico', exchange: 'BMV', micCode: 'XMEX' }),
      match('APPLX', { type: 'Mutual Fund' }),
      match('APPC/USD', { type: 'Digital Currency', exchange: 'Synthetic', country: '' }),
      match('SPY', { type: 'ETF', exchange: 'NYSE ARCA', micCode: 'ARCX' }),
    ];

    const response = await get('/market/search?q=app');

    expect(response.status).toBe(200);
    const { data } = searchResponseSchema.parse(response.body);
    expect(data).toEqual([
      { symbol: 'APP', name: 'APP Corp', exchange: 'NASDAQ', type: 'Common Stock' },
      { symbol: 'APPC', name: 'APPC Corp', exchange: 'CBOE', type: 'ETF' },
      { symbol: 'SPY', name: 'SPY Corp', exchange: 'NYSE ARCA', type: 'ETF' },
    ]);
  });

  it('orders exact ticker first, then tickers starting with the query, then the rest (max 8)', async () => {
    const { get, provider } = setup();
    provider.searchMatches = [
      match('MSFT', { name: 'Microsoft Corp' }),
      match('MUU'),
      match('AMU'),
      match('MU'),
      ...['MU1', 'MU2', 'MU3', 'MU4', 'MU5', 'MU6'].map((symbol) => match(symbol)),
    ];

    const response = await get('/market/search?q=mu');

    const { data } = searchResponseSchema.parse(response.body);
    expect(data.map((result) => result.symbol)).toEqual([
      'MU',
      'MUU',
      'MU1',
      'MU2',
      'MU3',
      'MU4',
      'MU5',
      'MU6',
    ]);
  });

  it('answers an empty list when the provider rejects the query, without caching it', async () => {
    const { get, provider } = setup();
    provider.failWith = new ProviderNotFoundError('symbol is invalid');

    const response = await get('/market/search?q=app');
    provider.failWith = null;
    await get('/market/search?q=app').expect(200);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
    expect(provider.searchCalls).toHaveLength(2);
  });

  it('caches by lowercase query, so a repeated search spends no credit', async () => {
    const { get, provider } = setup();

    await get('/market/search?q=App').expect(200);
    await get('/market/search?q=app').expect(200);

    expect(provider.searchCalls).toEqual(['App']);
  });

  it('400 for a query longer than 32 characters', async () => {
    const { get } = setup();

    const response = await get(`/market/search?q=${'a'.repeat(33)}`);

    expect(response.status).toBe(400);
  });
});

describe('GET /market/series/:symbol', () => {
  it('returns ascending points with the period change, using the range parameters', async () => {
    const { get, provider, clock } = setup();

    const response = await get('/market/series/aapl?range=6M');

    expect(response.status).toBe(200);
    const { data } = seriesResponseSchema.parse(response.body);
    expect(data).toEqual({
      symbol: 'AAPL',
      range: '6M',
      points: provider.seriesPoints,
      periodChange: 10,
      periodChangePercent: 10,
      asOf: new Date(clock.current).toISOString(),
      stale: false,
    });
    expect(provider.seriesCalls).toEqual([
      { symbol: 'AAPL', params: { interval: '1day', outputsize: 126 } },
    ]);
  });

  it('defaults to 1M and serves the repeat from the cache', async () => {
    const { get, provider } = setup();

    await get('/market/series/AAPL').expect(200);
    const response = await get('/market/series/AAPL?range=1M');

    expect(response.body.data.range).toBe('1M');
    expect(provider.seriesCalls).toHaveLength(1);
  });

  it('400 for an unknown range', async () => {
    const { get } = setup();

    const response = await get('/market/series/AAPL?range=2Y');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('404 for an unknown symbol, remembered for 15 minutes', async () => {
    const { get, provider } = setup();

    const response = await get('/market/series/ZZZZ');
    await get('/market/series/ZZZZ').expect(404);

    expect(response.status).toBe(404);
    expect(provider.seriesCalls).toHaveLength(1);
  });

  it('serves the expired series with stale: true when out of credits', async () => {
    const { get, clock } = setup({ market: { creditsPerMinute: 1 } });
    await get('/market/series/AAPL').expect(200);
    clock.advance(60 * MINUTE);
    // The cached AAPL series has expired; MSFT takes the only credit of the new minute window.
    await get('/market/series/MSFT').expect(200);

    const response = await get('/market/series/AAPL');

    expect(response.status).toBe(200);
    expect(response.body.data.stale).toBe(true);
  });

  it('429 with retryAfter when out of credits and nothing is cached', async () => {
    const { get } = setup({ market: { creditsPerMinute: 1 } });
    await get('/market/series/MSFT').expect(200);

    const response = await get('/market/series/AAPL');

    expect(response.status).toBe(429);
    expect(response.body.error.retryAfter).toBe(40);
  });
});
