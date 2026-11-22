import { describe, expect, it } from 'vitest';
import { seriesRangeConfig } from '../src/modules/market/series-range.js';

const MINUTE = 60_000;

// The invalid range (400) and the 1M default are covered end to end in market.test.ts.
describe('seriesRangeConfig', () => {
  it.each([
    ['1D', '5min', 78, 5 * MINUTE],
    ['1W', '30min', 65, 15 * MINUTE],
    ['1M', '1day', 22, 60 * MINUTE],
    ['6M', '1day', 126, 60 * MINUTE],
    ['1Y', '1day', 252, 60 * MINUTE],
  ] as const)(
    'translates %s to interval %s, %i points and its cache TTL',
    (range, interval, outputsize, ttl) => {
      expect(seriesRangeConfig(range)).toEqual({ interval, outputsize, cacheTtlMs: ttl });
    },
  );
});
