import { Skeleton } from '@/components/ui/skeleton';
import type { SparklineState } from '@/hooks/use-sparklines';
import { changeDirection, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

const WIDTH = 100;
const HEIGHT = 32;
/** Keeps the stroke inside the box at the highest and lowest points. */
const PADDING = 2;

const COLOR = {
  up: 'text-positive',
  down: 'text-negative',
  flat: 'text-muted-foreground',
} as const;

function toPolylinePoints(values: readonly number[]): string {
  if (values.length < 2) return `0,${HEIGHT / 2} ${WIDTH},${HEIGHT / 2}`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = WIDTH / (values.length - 1);
  return values
    .map((value, index) => {
      const x = index * step;
      const y = PADDING + (1 - (value - min) / span) * (HEIGHT - PADDING * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

interface SparklineProps {
  state: SparklineState;
  className?: string;
}

/**
 * One-month trend without axes or tooltip (conventions §5), colored by the period change. A
 * failed or retrying sparkline is a flat muted line: it is secondary and never shows an error.
 */
export function Sparkline({ state, className }: SparklineProps) {
  if (state.status === 'loading') {
    return <Skeleton className={cn('h-8 w-24', className)} aria-hidden="true" />;
  }

  const ready = state.status === 'ready' ? state.series : null;
  const values = ready?.points.map((point) => point.close) ?? [];
  const direction = ready ? changeDirection(ready.periodChangePercent) : 'flat';

  return (
    <span className={cn('inline-flex h-8 w-24', COLOR[direction], className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="size-full overflow-visible"
        aria-hidden="true"
      >
        <polyline
          points={toPolylinePoints(values)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="sr-only">
        {ready ? `1M trend ${formatPercent(ready.periodChangePercent)}` : '1M trend unavailable'}
      </span>
    </span>
  );
}
