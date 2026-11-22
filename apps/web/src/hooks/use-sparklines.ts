import type { Series } from '@ruut/shared';
import { useQueries, useQueryClient, type QueryState } from '@tanstack/react-query';
import { queryKeys, sparklineQueryOptions } from '@/lib/market-queries';

/** At most this many sparkline requests at once (spec 03 §4), so quotes keep their credits. */
export const SPARKLINE_CONCURRENCY = 2;

export type SparklineState =
  | { status: 'loading' }
  | { status: 'ready'; series: Series }
  /** Failed or retrying: drawn as a flat muted line. */
  | { status: 'failed' };

/**
 * Which sparkline queries may run, in watchlist order. A query that already has a result keeps
 * its observer; the others start only while fewer than SPARKLINE_CONCURRENCY are in flight (a
 * query waiting between retries counts as in flight, so a rate limit does not start new ones).
 * Keeping settled observers enabled is safe because sparklineQueryOptions never lets them refetch
 * on their own (no staleness, no retry on mount): the window is the only way a request starts.
 */
export function sparklineWindow(
  states: ReadonlyArray<Pick<QueryState, 'status' | 'fetchStatus'> | undefined>,
  enabled: boolean,
  concurrency = SPARKLINE_CONCURRENCY,
): boolean[] {
  let inFlight = 0;
  return states.map((state) => {
    if (!enabled) return false;
    if (state && state.status !== 'pending' && state.fetchStatus !== 'fetching') return true;
    if (inFlight >= concurrency) return false;
    inFlight += 1;
    return true;
  });
}

/**
 * Sparklines of the watchlist, loaded after the quotes and two at a time. `enabled` should stay
 * true once the quotes have loaded: a false → true flip makes every failed sparkline retry at once.
 */
export function useSparklines(
  symbols: readonly string[],
  enabled: boolean,
): Record<string, SparklineState> {
  const queryClient = useQueryClient();
  // The cache is the source of truth for what is in flight; useQueries re-renders on every change.
  const flags = sparklineWindow(
    symbols.map((symbol) => queryClient.getQueryState(queryKeys.sparkline(symbol))),
    enabled,
  );
  const results = useQueries({
    queries: symbols.map((symbol, index) => ({
      ...sparklineQueryOptions(symbol),
      enabled: flags[index] ?? false,
    })),
  });

  const states: Record<string, SparklineState> = {};
  results.forEach((result, index) => {
    const symbol = symbols[index];
    if (symbol === undefined) return;
    if (result.data) states[symbol] = { status: 'ready', series: result.data };
    else if (result.isError || result.failureCount > 0) states[symbol] = { status: 'failed' };
    else states[symbol] = { status: 'loading' };
  });
  return states;
}
