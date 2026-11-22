'use client';

import {
  DEFAULT_SERIES_RANGE,
  seriesRangeSchema,
  type Quote,
  type Series,
  type SeriesRange,
} from '@ruut/shared';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChangeIndicator } from '@/components/change-indicator';
import { DelayedBadge } from '@/components/delayed-badge';
import { ErrorState } from '@/components/error-state';
import { KeyMetrics } from '@/components/key-metrics';
import { RangeSelector } from '@/components/range-selector';
import { StaleBadge } from '@/components/stale-badge';
import { ChartSkeleton } from '@/components/stock-detail-skeleton';
import { WatchlistToggleButton } from '@/components/watchlist-toggle-button';
import { formatAsOf, formatPrice } from '@/lib/format';
import {
  MARKET_CLOSED_REFETCH_MS,
  MARKET_OPEN_REFETCH_MS,
  quoteQueryOptions,
  seriesQueryOptions,
} from '@/lib/market-queries';
import { isRateLimited } from '@/lib/query-client';
import { cn } from '@/lib/utils';

// Lightweight Charts touches `window` on import: client only, outside the server bundle.
const PriceChart = dynamic(() => import('@/components/price-chart').then((mod) => mod.PriceChart), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

const PERIOD_LABEL: Record<SeriesRange, string> = {
  '1D': 'Today',
  '1W': 'Past week',
  '1M': 'Past month',
  '6M': 'Past 6 months',
  '1Y': 'Past year',
};

export function parseRange(value: string | null): SeriesRange {
  const parsed = seriesRangeSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_SERIES_RANGE;
}

/**
 * Detail page body (spec 03 §4). The quote arrives from the server and keeps refreshing here; the
 * range lives in `?range=` and changes through the History API, which Next.js syncs with
 * useSearchParams without a server round trip.
 */
export function StockDetail({ initialQuote }: { initialQuote: Quote }) {
  const symbol = initialQuote.symbol;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const range = parseRange(searchParams.get('range'));

  const quoteQuery = useQuery({
    ...quoteQueryOptions(symbol),
    initialData: initialQuote,
    refetchInterval: (query) =>
      query.state.data?.isMarketOpen ? MARKET_OPEN_REFETCH_MS : MARKET_CLOSED_REFETCH_MS,
  });
  const quote = quoteQuery.data;
  const series = useQuery(seriesQueryOptions(symbol, range));

  function selectRange(next: SeriesRange) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_SERIES_RANGE) params.delete('range');
    else params.set('range', next);
    const query = params.toString();
    window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
  }

  const stale = quote.stale || (series.data?.stale ?? false);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight uppercase">{symbol}</h1>
          <p className="text-sm text-muted-foreground">
            {quote.name} · {quote.exchange}
          </p>
        </div>
        <WatchlistToggleButton symbol={symbol} name={quote.name} />
      </header>

      <section aria-label="Price" className="space-y-1">
        <p className="text-4xl font-semibold tabular-nums">
          {formatPrice(quote.price, quote.currency)}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <ChangeIndicator change={quote.change} percent={quote.changePercent} arrow />
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatAsOf(quote.asOf)}
          </span>
          {stale ? <StaleBadge /> : null}
          <DelayedBadge minutes={quote.delayMinutes} />
        </div>
      </section>

      <section aria-label="Price chart" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RangeSelector value={range} onChange={selectRange} />
          {series.data ? (
            <p className="flex items-center gap-2 text-sm">
              <ChangeIndicator
                change={series.data.periodChange}
                percent={series.data.periodChangePercent}
              />
              <span className="text-xs text-muted-foreground">
                {PERIOD_LABEL[series.data.range]}
              </span>
            </p>
          ) : null}
        </div>
        <ChartArea state={series} currency={quote.currency} onRetry={() => void series.refetch()} />
      </section>

      <KeyMetrics quote={quote} />
    </div>
  );
}

interface ChartAreaProps {
  state: UseQueryResult<Series>;
  currency: string;
  onRetry: () => void;
}

function ChartArea({ state, currency, onRetry }: ChartAreaProps) {
  if (state.data) {
    if (state.data.points.length === 0) {
      return (
        <p className="flex h-80 items-center justify-center rounded-lg border border-border text-sm text-muted-foreground md:h-105">
          No price data for this range yet.
        </p>
      );
    }
    return (
      <div
        aria-busy={state.isPlaceholderData}
        className={cn('transition-opacity', state.isPlaceholderData && 'opacity-60')}
      >
        <PriceChart series={state.data} currency={currency} />
      </div>
    );
  }
  // Rate limited with nothing cached: the global banner counts down and refetches.
  if (state.isError && !isRateLimited(state.error)) {
    return (
      <ErrorState
        title="We couldn't load the chart"
        onRetry={onRetry}
        className="h-80 justify-center md:h-105"
      />
    );
  }
  return <ChartSkeleton />;
}
