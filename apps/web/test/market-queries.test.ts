import type { Quote, WatchlistResponse } from '@ruut/shared';
import { describe, expect, it } from 'vitest';
import { sparklineWindow } from '@/hooks/use-sparklines';
import { ApiError } from '@/lib/api-error';
import {
  MARKET_CLOSED_REFETCH_MS,
  MARKET_OPEN_REFETCH_MS,
  sparklineRetry,
  sparklineRetryDelay,
  watchlistRefetchInterval,
} from '@/lib/market-queries';
import { shouldRetry } from '@/lib/query-client';

function quote(symbol: string, isMarketOpen: boolean): Quote {
  return {
    symbol,
    name: symbol,
    exchange: 'NASDAQ',
    currency: 'USD',
    price: 100,
    change: 1,
    changePercent: 1,
    open: 99,
    high: 101,
    low: 98,
    previousClose: 99,
    volume: null,
    fiftyTwoWeek: { low: 80, high: 120 },
    isMarketOpen,
    asOf: '2026-11-20T20:59:00.000Z',
    stale: false,
    delayMinutes: 0,
  };
}

function watchlist(...quotes: Array<Quote | null>): WatchlistResponse {
  return {
    data: quotes.map((item, index) => ({
      symbol: item?.symbol ?? `SYM${index}`,
      name: 'Name',
      addedAt: '2026-11-20T00:00:00.000Z',
      quote: item,
    })),
  };
}

describe('watchlistRefetchInterval', () => {
  it('polls every 2 minutes when any quote says the market is open', () => {
    const data = watchlist(quote('AAPL', false), null, quote('MSFT', true));
    expect(watchlistRefetchInterval(data)).toBe(MARKET_OPEN_REFETCH_MS);
  });

  it('slows down to 15 minutes when the market is closed, unknown or the list is empty', () => {
    expect(watchlistRefetchInterval(watchlist(quote('AAPL', false), null))).toBe(
      MARKET_CLOSED_REFETCH_MS,
    );
    expect(watchlistRefetchInterval(watchlist(null))).toBe(MARKET_CLOSED_REFETCH_MS);
    expect(watchlistRefetchInterval(watchlist())).toBe(MARKET_CLOSED_REFETCH_MS);
    expect(watchlistRefetchInterval(undefined)).toBe(MARKET_CLOSED_REFETCH_MS);
  });
});

describe('default retry policy', () => {
  it('never retries a 4xx, including a 429', () => {
    expect(shouldRetry(0, new ApiError('RATE_LIMITED', 'limit', 429, 30))).toBe(false);
    expect(shouldRetry(0, new ApiError('NOT_FOUND', 'missing', 404))).toBe(false);
  });

  it('retries a 5xx or a network failure exactly once', () => {
    const upstream = new ApiError('UPSTREAM_ERROR', 'down', 502);
    const network = new ApiError('UPSTREAM_ERROR', 'offline', 0);
    expect(shouldRetry(0, upstream)).toBe(true);
    expect(shouldRetry(1, upstream)).toBe(false);
    expect(shouldRetry(0, network)).toBe(true);
  });
});

describe('sparkline retries', () => {
  const limited = new ApiError('RATE_LIMITED', 'limit', 429, 42);

  it('retries a rate limit up to 3 times, waiting for retryAfter', () => {
    expect(sparklineRetry(0, limited)).toBe(true);
    expect(sparklineRetry(2, limited)).toBe(true);
    expect(sparklineRetry(3, limited)).toBe(false);
    expect(sparklineRetryDelay(0, limited)).toBe(42_000);
  });

  it('does not retry a missing symbol and never waits less than a second', () => {
    expect(sparklineRetry(0, new ApiError('NOT_FOUND', 'missing', 404))).toBe(false);
    expect(sparklineRetryDelay(0, new ApiError('RATE_LIMITED', 'limit', 429, 0))).toBe(1000);
  });
});

describe('sparklineWindow', () => {
  const pending = { status: 'pending', fetchStatus: 'fetching' } as const;
  const idle = { status: 'pending', fetchStatus: 'idle' } as const;
  const done = { status: 'success', fetchStatus: 'idle' } as const;
  const failed = { status: 'error', fetchStatus: 'idle' } as const;

  it('waits for the watchlist before starting any sparkline', () => {
    expect(sparklineWindow([undefined, undefined], false)).toEqual([false, false]);
  });

  it('starts at most two at a time, in watchlist order', () => {
    expect(sparklineWindow([undefined, undefined, undefined, undefined], true)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('moves the window forward as requests settle, whatever the outcome', () => {
    expect(sparklineWindow([done, failed, pending, idle, idle], true)).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it('counts a query waiting between retries as in flight', () => {
    expect(sparklineWindow([pending, pending, idle], true)).toEqual([true, true, false]);
  });
});
