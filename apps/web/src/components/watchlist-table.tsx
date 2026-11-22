'use client';

import type { WatchlistItem } from '@ruut/shared';
import { X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import { QuoteChange, QuotePrice, QuoteTrend } from '@/components/quote-values';
import { Sparkline } from '@/components/sparkline';
import { StaleBadge } from '@/components/stale-badge';
import { Button } from '@/components/ui/button';
import type { SparklineState } from '@/hooks/use-sparklines';
import { stockPath } from '@/lib/routes';

export interface WatchlistListProps {
  items: readonly WatchlistItem[];
  sparklines: Record<string, SparklineState>;
  onRemove: (symbol: string) => void;
}

export const SPARKLINE_LOADING: SparklineState = { status: 'loading' };

/**
 * Desktop watchlist (conventions §5). The whole row opens the detail for pointer users; the
 * ticker is the real link, so keyboard and screen reader users get a focusable target.
 */
export function WatchlistTable({ items, sparklines, onRemove }: WatchlistListProps) {
  const router = useRouter();

  function openRow(event: MouseEvent<HTMLTableRowElement>, symbol: string) {
    // The link navigates by itself, and the remove button must not open the detail.
    if (event.target instanceof Element && event.target.closest('a, button')) return;
    router.push(stockPath(symbol));
  }

  return (
    <table data-testid="watchlist-table" className="hidden w-full text-sm md:table">
      <caption className="sr-only">Your watchlist</caption>
      <thead>
        <tr className="border-b border-border text-xs text-muted-foreground">
          <th scope="col" className="px-3 py-2 text-left font-medium">
            Symbol
          </th>
          <th scope="col" className="px-3 py-2 text-left font-medium">
            Name
          </th>
          <th scope="col" className="px-3 py-2 text-right font-medium">
            Price
          </th>
          <th scope="col" className="px-3 py-2 text-right font-medium">
            Change
          </th>
          <th scope="col" className="px-3 py-2 text-right font-medium">
            Trend
          </th>
          <th scope="col" className="px-3 py-2 text-right font-medium">
            1M
          </th>
          <th scope="col" className="w-14 px-3 py-2">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map(({ symbol, name, quote }) => (
          <tr
            key={symbol}
            onClick={(event) => openRow(event, symbol)}
            className="cursor-pointer border-b border-border transition-colors hover:bg-surface"
          >
            <td className="px-3 py-3">
              <Link
                href={stockPath(symbol)}
                className="rounded-sm font-semibold tracking-tight uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {symbol}
              </Link>
            </td>
            <td className="max-w-64 truncate px-3 py-3 text-muted-foreground">{name}</td>
            <td className="px-3 py-3 text-right">
              <span className="inline-flex items-center justify-end gap-2">
                {quote?.stale ? <StaleBadge /> : null}
                <QuotePrice quote={quote} />
              </span>
            </td>
            <td className="px-3 py-3 text-right">
              <QuoteChange quote={quote} />
            </td>
            <td className="px-3 py-3 text-right">
              <QuoteTrend quote={quote} />
            </td>
            <td className="px-3 py-3 text-right">
              <Sparkline state={sparklines[symbol] ?? SPARKLINE_LOADING} className="ml-auto" />
            </td>
            <td className="px-3 py-1 text-right">
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={`Remove ${symbol} from watchlist`}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(symbol);
                }}
              >
                <X className="size-5" aria-hidden="true" />
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
