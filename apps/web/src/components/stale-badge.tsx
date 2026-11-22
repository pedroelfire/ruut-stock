import { cn } from '@/lib/utils';

/** Marks a value served from the cache because a refresh was not possible (conventions §6). */
export function StaleBadge({ className }: { className?: string }) {
  return (
    <span
      title="Showing the last saved price"
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border border-warning px-2 py-0.5 text-xs font-medium text-warning',
        className,
      )}
    >
      Stale
    </span>
  );
}
