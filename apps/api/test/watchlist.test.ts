import { addWatchlistItemResponseSchema, watchlistResponseSchema } from '@ruut/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { MarketConfig } from '../src/app.js';
import { USER_RATE_LIMIT } from '../src/middleware/rate-limit.js';
import {
  bearerFor,
  createTestApp,
  FakeMarketDataProvider,
  InMemoryWatchlistRepository,
  makeQuote,
} from './helpers.js';

const ALICE = 'user-alice';
const BOB = 'user-bob';
const EIGHT_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'NFLX'];

function setup(options: { market?: Partial<MarketConfig> } = {}) {
  const provider = new FakeMarketDataProvider([...EIGHT_SYMBOLS, 'AMD', 'INTC']);
  provider.knownSymbols.set('AMD', makeQuote('AMD', { name: 'Advanced Micro Devices, Inc.' }));
  const repository = new InMemoryWatchlistRepository();
  const { app } = createTestApp(undefined, {
    marketDataProvider: provider,
    watchlistRepository: repository,
    ...(options.market && { market: options.market }),
  });
  const as = (userId: string) => ({
    get: () => request(app).get('/watchlist').set('Authorization', bearerFor(userId)),
    add: (symbol: string) =>
      request(app).post('/watchlist').set('Authorization', bearerFor(userId)).send({ symbol }),
    remove: (symbol: string) =>
      request(app).delete(`/watchlist/${symbol}`).set('Authorization', bearerFor(userId)),
  });
  const seed = (userId: string, symbols: string[]) =>
    repository.seed(
      userId,
      symbols.map((symbol) => ({ symbol, name: `${symbol} stored name` })),
    );
  return { app, provider, repository, as, seed };
}

describe('watchlist', () => {
  describe('GET /watchlist', () => {
    it('returns only the caller’s items, with the stored name and a quote each', async () => {
      const { as, seed } = setup();
      seed(ALICE, ['AAPL', 'MSFT']);
      seed(BOB, ['TSLA']);

      const response = await as(ALICE).get();

      expect(response.status).toBe(200);
      const body = watchlistResponseSchema.parse(response.body);
      expect(body.data.map((item) => [item.symbol, item.name, item.quote?.symbol])).toEqual([
        ['AAPL', 'AAPL stored name', 'AAPL'],
        ['MSFT', 'MSFT stored name', 'MSFT'],
      ]);
      expect(body.meta).toBeUndefined();
    });

    it('returns an empty list without calling the provider', async () => {
      const { as, provider } = setup();

      const response = await as(ALICE).get();

      expect(response.body).toEqual({ data: [] });
      expect(provider.creditsSpent).toBe(0);
    });

    it('keeps items without a quote (quote: null) and adds meta.partial when credits run short', async () => {
      const { as, seed } = setup({ market: { creditsPerMinute: 2 } });
      seed(ALICE, ['AAPL', 'MSFT', 'NVDA']);

      const response = await as(ALICE).get();

      expect(response.status).toBe(200);
      const body = watchlistResponseSchema.parse(response.body);
      expect(body.data.map((item) => [item.symbol, item.quote === null])).toEqual([
        ['AAPL', false],
        ['MSFT', false],
        ['NVDA', true],
      ]);
      expect(body.meta).toMatchObject({ partial: true });
    });
  });

  describe('POST /watchlist', () => {
    it('adds the symbol with the name from the quote and returns 201', async () => {
      const { as, repository } = setup();

      const response = await as(ALICE).add(' amd ');

      expect(response.status).toBe(201);
      const { data } = addWatchlistItemResponseSchema.parse(response.body);
      expect(data).toMatchObject({ symbol: 'AMD', name: 'Advanced Micro Devices, Inc.' });
      expect(await repository.find(ALICE, 'AMD')).toMatchObject({ exchange: 'NASDAQ' });
    });

    it('409 for a duplicate, without spending credits', async () => {
      const { as, seed, provider } = setup();
      seed(ALICE, ['AAPL']);

      const response = await as(ALICE).add('aapl');

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
      expect(provider.creditsSpent).toBe(0);
    });

    it('409 when the list already has 8 symbols, without spending credits', async () => {
      const { as, seed, provider } = setup();
      seed(ALICE, EIGHT_SYMBOLS);

      const response = await as(ALICE).add('AMD');

      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/full/i);
      expect(provider.creditsSpent).toBe(0);
    });

    it('404 for a symbol the provider does not know, and nothing is stored', async () => {
      const { as, repository } = setup();

      const response = await as(ALICE).add('ZZZZ');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(await repository.count(ALICE)).toBe(0);
    });

    it('429 (not 404) when the symbol cannot be checked for lack of credits', async () => {
      const { as, seed } = setup({ market: { creditsPerMinute: 1 } });
      seed(BOB, ['MSFT']);
      await as(BOB).get().expect(200);

      const response = await as(ALICE).add('AMD');

      expect(response.status).toBe(429);
      expect(response.body.error.retryAfter).toBeGreaterThan(0);
    });

    it('lets two users hold the same symbol', async () => {
      const { as } = setup();

      await as(ALICE).add('AMD').expect(201);
      const response = await as(BOB).add('AMD');

      expect(response.status).toBe(201);
    });

    it('never goes over 8 when two adds race past the pre-check', async () => {
      const { as, seed, repository } = setup();
      seed(ALICE, EIGHT_SYMBOLS.slice(0, 7));
      const atomicAdd = vi.spyOn(repository, 'addWithinLimit');

      const responses = await Promise.all([as(ALICE).add('AMD'), as(ALICE).add('INTC')]);

      // Both requests passed the service pre-check: only the atomic insert stopped the second.
      expect(atomicAdd).toHaveBeenCalledTimes(2);
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(await repository.count(ALICE)).toBe(8);
    });

    it('stores a symbol once when the same add is sent twice at the same time', async () => {
      const { as, repository } = setup();
      const atomicAdd = vi.spyOn(repository, 'addWithinLimit');

      const responses = await Promise.all([as(ALICE).add('AMD'), as(ALICE).add('AMD')]);

      expect(atomicAdd).toHaveBeenCalledTimes(2);
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(await repository.count(ALICE)).toBe(1);
    });

    it('400 for an invalid symbol', async () => {
      const { as } = setup();

      const response = await as(ALICE).add('AAPL,MSFT');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('401 when the token is valid but its user no longer exists', async () => {
      const { as, repository } = setup();
      // Only Alice exists: Bob's signed token belongs to a deleted account.
      repository.knownUsers.add(ALICE);

      const response = await as(BOB).add('AMD');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(await repository.count(BOB)).toBe(0);
    });
  });

  describe('DELETE /watchlist/:symbol', () => {
    it('removes the symbol (case-insensitive) and returns 204', async () => {
      const { as, seed, repository } = setup();
      seed(ALICE, ['AAPL', 'MSFT']);

      const response = await as(ALICE).remove('aapl');

      expect(response.status).toBe(204);
      expect((await repository.list(ALICE)).map((item) => item.symbol)).toEqual(['MSFT']);
    });

    it('404 for a symbol that is not in the list', async () => {
      const { as } = setup();

      const response = await as(ALICE).remove('AAPL');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('cannot remove another user’s symbol', async () => {
      const { as, seed, repository } = setup();
      seed(ALICE, ['AAPL']);

      const response = await as(BOB).remove('AAPL');

      expect(response.status).toBe(404);
      expect(await repository.find(ALICE, 'AAPL')).not.toBeNull();
    });
  });

  it('401 without a token', async () => {
    const { app } = setup();

    const response = await request(app).get('/watchlist');

    expect(response.status).toBe(401);
  });
});

describe('per-user rate limit', () => {
  it('blocks a user after 120 requests a minute without affecting other users', async () => {
    const { as } = setup();
    for (let i = 0; i < USER_RATE_LIMIT.limit; i += 1) {
      await as(ALICE).get().expect(200);
    }

    const blocked = await as(ALICE).get();
    const otherUser = await as(BOB).get();

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatchObject({ code: 'RATE_LIMITED' });
    expect(blocked.body.error.retryAfter).toBeGreaterThan(0);
    expect(otherUser.status).toBe(200);
  });
});
