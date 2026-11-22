import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { changeDirection, formatChange, formatPercent, type ChangeDirection } from '@/lib/format';
import { cn } from '@/lib/utils';

const COLOR: Record<ChangeDirection, string> = {
  up: 'text-positive',
  down: 'text-negative',
  flat: 'text-muted-foreground',
};

interface ChangeIndicatorProps {
  /** Absolute change (`+2.31`). */
  change?: number;
  /** Percent change, in percent units (`+1.24%`). */
  percent?: number;
  /** Lists add an arrow; a zero change never has one. */
  arrow?: boolean;
  className?: string;
}

/**
 * A price change that never relies on color alone (conventions §2): signed text with U+2212,
 * an optional arrow and the semantic color. With both values: `+2.31 (+1.24%)`.
 */
export function ChangeIndicator({
  change,
  percent,
  arrow = false,
  className,
}: ChangeIndicatorProps) {
  const direction = changeDirection(percent ?? change ?? 0);
  const parts: string[] = [];
  if (change !== undefined) parts.push(formatChange(change));
  if (percent !== undefined) {
    parts.push(change === undefined ? formatPercent(percent) : `(${formatPercent(percent)})`);
  }
  const Arrow = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : null;

  return (
    <span
      className={cn('inline-flex items-center gap-0.5 tabular-nums', COLOR[direction], className)}
    >
      {arrow && Arrow ? <Arrow className="size-4 shrink-0" aria-hidden="true" /> : null}
      <span>{parts.join(' ')}</span>
    </span>
  );
}
