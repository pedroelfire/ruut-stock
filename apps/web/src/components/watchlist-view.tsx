'use client';

import { WATCHLIST_MAX_SYMBOLS, type WatchlistResponse } from '@ruut/shared';
import { useQuery } from '@tanstack/react-query';
import { ListPlus, Plus } from 'lucide-react';
import { DelayedBadge } from '@/components/delayed-badge';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { useSymbolSearch } from '@/components/symbol-search-context';
import { Button } from '@/components/ui/button';
import { WatchlistCardList } from '@/components/watchlist-card-list';
import { WatchlistSkeleton } from '@/components/watchlist-skeleton';
import { WatchlistTable } from '@/components/watchlist-table';
import { useSparklines } from '@/hooks/use-sparklines';
import {
  WATCHLIST_FULL_MESSAGE,
  useWatchlistActions,
  type WatchlistCandidate,
} from '@/hooks/use-watchlist-actions';
import { formatMarketTime } from '@/lib/format';
import { watchlistQueryOptions, watchlistRefetchInterval } from '@/lib/market-queries';
import { isRateLimited } from '@/lib/query-client';

/** One-click suggestions of the empty state (H3). Names are replaced by the stored ones. */
const SUGGESTIONS: readonly WatchlistCandidate[] = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation' },
];

function maxDelayMinutes(data: WatchlistResponse): number {
  return Math.max(0, ...data.data.map((item) => item.quote?.delayMinutes ?? 0));
}

/** Dashboard (spec 03 §4): header, watchlist and every §6 state. */
export function WatchlistView() {
  const { openSearch } = useSymbolSearch();
  // The only observer with a polling interval: other components read the same cache entry.
  const watchlist = useQuery({
    ...watchlistQueryOptions(),
    refetchInterval: (query) => watchlistRefetchInterval(query.state.data),
  });
  const actions = useWatchlistActions();
  const data = watchlist.data;
  const items = data?.data ?? [];
  // `data`, not `isSuccess`: a failed refetch keeps the data but would flip the window off and on.
  const sparklines = useSparklines(
    items.map((item) => item.symbol),
    data !== undefined,
  );

  let body;
  if (data) {
    body =
      items.length === 0 ? (
        <EmptyState
          icon={ListPlus}
          title="Your watchlist is empty"
          description="Search for a stock to add it to your watchlist."
          action={
            <div className="flex flex-col items-center gap-3">
              <Button onClick={openSearch}>Search stocks</Button>
              <div
                role="group"
                aria-label="Suggestions"
                className="flex flex-wrap justify-center gap-2"
              >
                {SUGGESTIONS.map((suggestion) => (
                  <Button
                    key={suggestion.symbol}
                    variant="outline"
                    aria-label={`Add ${suggestion.symbol} to watchlist`}
                    onClick={() => actions.add(suggestion)}
                  >
                    <Plus aria-hidden="true" />
                    {suggestion.symbol}
                  </Button>
                ))}
              </div>
            </div>
          }
        />
      ) : (
        <>
          <WatchlistTable items={items} sparklines={sparklines} onRemove={actions.remove} />
          <WatchlistCardList items={items} sparklines={sparklines} onRemove={actions.remove} />
        </>
      );
  } else if (watchlist.isError && !isRateLimited(watchlist.error)) {
    body = (
      <ErrorState
        title="We couldn't load your watchlist"
        onRetry={() => void watchlist.refetch()}
      />
    );
  } else {
    // Loading, or rate limited with nothing cached: the global banner explains the wait.
    body = <WatchlistSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Watchlist</h1>
          {data ? (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums">
              <span>
                {items.length} {items.length === 1 ? 'symbol' : 'symbols'} · Updated{' '}
                {formatMarketTime(watchlist.dataUpdatedAt)}
              </span>
              <DelayedBadge minutes={maxDelayMinutes(data)} />
            </p>
          ) : null}
        </div>
        {/* Always there (spec 03 §4): searching does not depend on the watchlist loading. */}
        <Button onClick={openSearch}>
          <Plus aria-hidden="true" />
          Add symbol
        </Button>
      </div>
      {actions.error ? (
        <p role="status" className="text-sm text-muted-foreground">
          {actions.error}
        </p>
      ) : items.length >= WATCHLIST_MAX_SYMBOLS ? (
        <p className="text-sm text-muted-foreground">{WATCHLIST_FULL_MESSAGE}</p>
      ) : null}
      {body}
    </div>
  );
}
