import type { Quote } from '@ruut/shared';
import { ChangeIndicator } from '@/components/change-indicator';
import { MISSING_VALUE, formatPrice } from '@/lib/format';

/** `—` for sighted users, "Price unavailable" for screen readers (spec 03 §4). */
export function Unavailable() {
  return (
    <>
      <span aria-hidden="true">{MISSING_VALUE}</span>
      <span className="sr-only">Price unavailable</span>
    </>
  );
}

export function QuotePrice({ quote }: { quote: Quote | null }) {
  if (!quote) return <Unavailable />;
  return <span className="tabular-nums">{formatPrice(quote.price, quote.currency)}</span>;
}

/** Absolute change, signed and colored. */
export function QuoteChange({ quote }: { quote: Quote | null }) {
  if (!quote) return <span aria-hidden="true">{MISSING_VALUE}</span>;
  return <ChangeIndicator change={quote.change} />;
}

/** Percent change with its arrow. */
export function QuoteTrend({ quote }: { quote: Quote | null }) {
  if (!quote) return <span aria-hidden="true">{MISSING_VALUE}</span>;
  return <ChangeIndicator percent={quote.changePercent} arrow />;
}
