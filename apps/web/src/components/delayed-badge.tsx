import { cn } from '@/lib/utils';

/** `Delayed · 15 min`, only when the provider's data comes with a delay (H5). */
export function DelayedBadge({ minutes, className }: { minutes: number; className?: string }) {
  if (minutes <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground tabular-nums',
        className,
      )}
    >
      Delayed · {minutes} min
    </span>
  );
}
