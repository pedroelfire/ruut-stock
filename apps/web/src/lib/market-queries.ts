import {
  quoteResponseSchema,
  searchResponseSchema,
  seriesResponseSchema,
  watchlistResponseSchema,
  type Quote,
  type SearchResult,
  type Series,
  type SeriesRange,
  type WatchlistResponse,
} from '@ruut/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { ApiError } from './api-error';
import { apiRequest } from './api-client';
import { isApiError } from './query-client';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Query keys of spec 03 §5, in one place so invalidations never drift from the queries. */
export const queryKeys = {
  search: (query: string) => ['search', query] as const,
  watchlist: () => ['watchlist'] as const,
  quote: (symbol: string) => ['quote', symbol] as const,
  series: (symbol: string, range: SeriesRange) => ['series', symbol, range] as const,
  sparkline: (symbol: string) => ['sparkline', symbol] as const,
};

const bffPath = (path: string) => `/api/bff/${path}`;

// ---------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------

export function searchQueryOptions(query: string) {
  return queryOptions({
    queryKey: queryKeys.search(query),
    queryFn: async ({ signal }): Promise<SearchResult[]> => {
      const params = new URLSearchParams({ q: query });
      const response = await apiRequest(
        bffPath(`market/search?${params.toString()}`),
        searchResponseSchema,
        { signal },
      );
      return response.data;
    },
    enabled: query.length > 0,
    // Same TTL as the API cache: results for a query do not change within a day.
    staleTime: 24 * HOUR,
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------------------------

export const MARKET_OPEN_REFETCH_MS = 2 * MINUTE;
export const MARKET_CLOSED_REFETCH_MS = 15 * MINUTE;

/**
 * 2 min while any quote says the market is open, 15 min otherwise: prices barely move when it is
 * closed, and the slower poll still notices the opening bell (spec 03 §5).
 */
export function watchlistRefetchInterval(data: WatchlistResponse | undefined): number {
  const anyOpen = data?.data.some((item) => item.quote?.isMarketOpen === true) ?? false;
  return anyOpen ? MARKET_OPEN_REFETCH_MS : MARKET_CLOSED_REFETCH_MS;
}

export function watchlistQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.watchlist(),
    queryFn: ({ signal }) => apiRequest(bffPath('watchlist'), watchlistResponseSchema, { signal }),
    staleTime: 2 * MINUTE,
    meta: { showsPrices: true },
  });
}

// ---------------------------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------------------------

export function quoteQueryOptions(symbol: string) {
  return queryOptions({
    queryKey: queryKeys.quote(symbol),
    queryFn: async ({ signal }): Promise<Quote> => {
      const params = new URLSearchParams({ symbols: symbol });
      const response = await apiRequest(
        bffPath(`market/quote?${params.toString()}`),
        quoteResponseSchema,
        { signal },
      );
      const quote = response.data.find((item) => item.symbol === symbol) ?? response.data[0];
      if (!quote) throw new ApiError('NOT_FOUND', 'Symbol not found', 404);
      return quote;
    },
    staleTime: 2 * MINUTE,
    meta: { showsPrices: true },
  });
}

// ---------------------------------------------------------------------------------------------
// Series and sparklines
// ---------------------------------------------------------------------------------------------

/** Mirrors the API cache TTL per range (spec 02 §4): refetching sooner would only hit the cache. */
const SERIES_STALE_TIME: Record<SeriesRange, number> = {
  '1D': 5 * MINUTE,
  '1W': 15 * MINUTE,
  '1M': HOUR,
  '6M': HOUR,
  '1Y': HOUR,
};

async function fetchSeries(symbol: string, range: SeriesRange, signal: AbortSignal) {
  const params = new URLSearchParams({ range });
  const response = await apiRequest(
    bffPath(`market/series/${encodeURIComponent(symbol)}?${params.toString()}`),
    seriesResponseSchema,
    { signal },
  );
  return response.data;
}

export function seriesQueryOptions(symbol: string, range: SeriesRange) {
  return queryOptions({
    queryKey: queryKeys.series(symbol, range),
    queryFn: ({ signal }): Promise<Series> => fetchSeries(symbol, range, signal),
    staleTime: SERIES_STALE_TIME[range],
    meta: { showsPrices: true },
    // Keeps the previous range on screen while the new one loads, so the chart does not flash.
    placeholderData: keepPreviousData,
  });
}

export const SPARKLINE_MAX_RETRIES = 3;
const SPARKLINE_FALLBACK_DELAY_S = 5;

/** Sparklines retry quietly on a rate limit or a server failure; a 404 or a 400 is final. */
export function sparklineRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= SPARKLINE_MAX_RETRIES) return false;
  if (!isApiError(error)) return true;
  return error.code === 'RATE_LIMITED' || error.status >= 500 || error.status === 0;
}

/** Waits exactly as long as the API asked (`retryAfter`), at least one second. */
export function sparklineRetryDelay(_failureCount: number, error: unknown): number {
  const seconds = isApiError(error)
    ? (error.retryAfter ?? SPARKLINE_FALLBACK_DELAY_S)
    : SPARKLINE_FALLBACK_DELAY_S;
  return Math.max(1, seconds) * 1000;
}

export function sparklineQueryOptions(symbol: string) {
  return queryOptions({
    queryKey: queryKeys.sparkline(symbol),
    // The API shares its cache entry with the detail's 1M series.
    queryFn: ({ signal }): Promise<Series> => fetchSeries(symbol, '1M', signal),
    // Only the two-at-a-time window may start a request (spec 03 §5). Any staleness-driven refetch
    // (mount, focus, reconnect, re-enable) would fire every stale sparkline at once and spend the
    // whole 8/min budget, so the data never goes stale while cached: it is reloaded through the
    // window once the entry is collected (gcTime after leaving the dashboard) or on a reload.
    // Daily closes over a month barely change within a session.
    staleTime: Infinity,
    // A failed query has no data, so it counts as stale anyway: these keep a final failure from
    // retrying every failed sparkline at once on remount, focus or reconnect.
    retryOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    meta: { silentRateLimit: true },
    retry: sparklineRetry,
    retryDelay: sparklineRetryDelay,
  });
}
