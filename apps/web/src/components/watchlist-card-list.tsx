'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { QuotePrice, QuoteTrend } from '@/components/quote-values';
import { Sparkline } from '@/components/sparkline';
import { StaleBadge } from '@/components/stale-badge';
import { Button } from '@/components/ui/button';
import { SPARKLINE_LOADING, type WatchlistListProps } from '@/components/watchlist-table';
import { stockPath } from '@/lib/routes';

/**
 * Mobile watchlist (conventions §5): ticker and name on the left, price and change on the right,
 * sparkline below. The ticker link stretches over the card; the remove button sits above it.
 */
export function WatchlistCardList({ items, sparklines, onRemove }: WatchlistListProps) {
  return (
    <ul data-testid="watchlist-card-list" className="space-y-3 md:hidden">
      {items.map(({ symbol, name, quote }) => (
        <li
          key={symbol}
          className="relative rounded-lg border border-border p-4 transition-colors hover:bg-surface"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Link
                href={stockPath(symbol)}
                className="font-semibold tracking-tight uppercase after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                {symbol}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{name}</p>
            </div>
            <div className="flex flex-col items-end gap-0.5 text-sm">
              <span className="inline-flex items-center gap-2">
                {quote?.stale ? <StaleBadge /> : null}
                <span className="font-medium">
                  <QuotePrice quote={quote} />
                </span>
              </span>
              <QuoteTrend quote={quote} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label={`Remove ${symbol} from watchlist`}
              className="relative z-10 -my-2 -mr-2"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(symbol);
              }}
            >
              <X className="size-5" aria-hidden="true" />
            </Button>
          </div>
          <Sparkline state={sparklines[symbol] ?? SPARKLINE_LOADING} className="mt-3 h-10 w-full" />
        </li>
      ))}
    </ul>
  );
}
