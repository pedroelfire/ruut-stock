import type { Quote } from '@ruut/shared';
import type { ReactNode } from 'react';
import { formatPrice, formatVolume } from '@/lib/format';

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1 rounded-lg border border-border bg-surface p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

/** Where the price sits inside the 52-week range, as a percentage clamped to 0–100. */
function rangePosition(price: number, low: number, high: number): number {
  if (high <= low) return 50;
  return Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
}

function FiftyTwoWeekRange({ quote }: { quote: Quote }) {
  const { low, high } = quote.fiftyTwoWeek;
  const position = rangePosition(quote.price, low, high);
  const low$ = formatPrice(low, quote.currency);
  const high$ = formatPrice(high, quote.currency);
  return (
    <div className="space-y-2">
      {/* If the cell is too narrow, the line breaks at the dash, never inside a price. */}
      <span className="block">
        <span className="whitespace-nowrap">{low$}</span> –{' '}
        <span className="whitespace-nowrap">{high$}</span>
      </span>
      <span
        className="relative block h-1.5 rounded-full bg-border"
        role="img"
        aria-label={`Current price ${formatPrice(quote.price, quote.currency)}, between the 52-week low of ${low$} and high of ${high$}`}
      >
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary"
          style={{ left: `${position}%` }}
        />
      </span>
    </div>
  );
}

/** Key metrics grid (conventions §5): two columns on mobile, three on desktop. */
export function KeyMetrics({ quote }: { quote: Quote }) {
  const price = (value: number) => formatPrice(value, quote.currency);
  return (
    <section aria-labelledby="key-metrics-title" className="space-y-3">
      <h2 id="key-metrics-title" className="text-base font-semibold">
        Key metrics
      </h2>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Metric label="Open">{price(quote.open)}</Metric>
        <Metric label="High">{price(quote.high)}</Metric>
        <Metric label="Low">{price(quote.low)}</Metric>
        <Metric label="Previous close">{price(quote.previousClose)}</Metric>
        <Metric label="Volume">{formatVolume(quote.volume)}</Metric>
        <Metric label="52-week range">
          <FiftyTwoWeekRange quote={quote} />
        </Metric>
      </dl>
    </section>
  );
}
