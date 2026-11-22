'use client';

import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWatchlistActions } from '@/hooks/use-watchlist-actions';

interface WatchlistToggleButtonProps {
  symbol: string;
  name: string;
}

/** Add or remove the symbol from the detail header (H3, H4). */
export function WatchlistToggleButton({ symbol, name }: WatchlistToggleButtonProps) {
  const actions = useWatchlistActions();

  if (actions.watchlist.isPending) return <Skeleton className="h-10 w-44" aria-hidden="true" />;
  // Failed with nothing cached: membership is unknown, and "Add" could duplicate a stored symbol.
  // The query recovers on its own (rate limit countdown, focus refetch).
  if (actions.watchlist.data === undefined) {
    return (
      <Button variant="outline" disabled>
        Watchlist unavailable
      </Button>
    );
  }

  const inWatchlist = actions.has(symbol);
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      {inWatchlist ? (
        <Button variant="outline" onClick={() => actions.remove(symbol)}>
          <Check aria-hidden="true" />
          Remove from watchlist
        </Button>
      ) : (
        <Button onClick={() => actions.add({ symbol, name })}>
          <Plus aria-hidden="true" />
          Add to watchlist
        </Button>
      )}
      {actions.error ? (
        <p role="status" className="max-w-xs text-sm text-muted-foreground sm:text-right">
          {actions.error}
        </p>
      ) : null}
    </div>
  );
}
