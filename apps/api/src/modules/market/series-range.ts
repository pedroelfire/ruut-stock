import type { SeriesRange } from '@ruut/shared';
import type { TimeSeriesParams } from '../../providers/twelve-data/index.js';

const MINUTE_MS = 60_000;

export interface SeriesRangeConfig extends TimeSeriesParams {
  cacheTtlMs: number;
}

/**
 * Spec 02 §4. Output sizes approximate a US session: 78 five-minute bars per day,
 * 13 thirty-minute bars × 5 days, and about 21 trading days per month.
 */
const SERIES_RANGE_CONFIG: Record<SeriesRange, SeriesRangeConfig> = {
  '1D': { interval: '5min', outputsize: 78, cacheTtlMs: 5 * MINUTE_MS },
  '1W': { interval: '30min', outputsize: 65, cacheTtlMs: 15 * MINUTE_MS },
  '1M': { interval: '1day', outputsize: 22, cacheTtlMs: 60 * MINUTE_MS },
  '6M': { interval: '1day', outputsize: 126, cacheTtlMs: 60 * MINUTE_MS },
  '1Y': { interval: '1day', outputsize: 252, cacheTtlMs: 60 * MINUTE_MS },
};

/** Pure translation of a chart range into provider parameters and cache TTL. */
export function seriesRangeConfig(range: SeriesRange): SeriesRangeConfig {
  return SERIES_RANGE_CONFIG[range];
}
