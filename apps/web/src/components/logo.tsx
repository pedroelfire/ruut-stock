import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Brand mark from the reference mockup: a 28 px rounded square in --primary with a trend line,
 * plus the wordmark. Decorative mark; the text carries the name.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-base font-semibold', className)}>
      <span
        className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"
        aria-hidden="true"
      >
        <TrendingUp className="size-4" />
      </span>
      <span>Stocks</span>
    </span>
  );
}
