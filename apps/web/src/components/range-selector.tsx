'use client';

import { SERIES_RANGES, type SeriesRange } from '@ruut/shared';
import { cn } from '@/lib/utils';

interface RangeSelectorProps {
  value: SeriesRange;
  onChange: (range: SeriesRange) => void;
}

/** Segmented control `1D · 1W · 1M · 6M · 1Y` (conventions §5). */
export function RangeSelector({ value, onChange }: RangeSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Chart range"
      className="inline-flex rounded-md border border-input bg-surface p-0.5"
    >
      {SERIES_RANGES.map((range) => {
        const selected = range === value;
        return (
          <button
            key={range}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(range)}
            className={cn(
              'h-10 min-w-11 rounded-sm px-3 text-sm font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              selected
                ? // Same color as the ring: the offset keeps the focus visible (conventions §9).
                  'bg-primary text-primary-foreground ring-offset-background focus-visible:ring-offset-2'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {range}
          </button>
        );
      })}
    </div>
  );
}
