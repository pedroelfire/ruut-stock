import { Skeleton } from '@/components/ui/skeleton';

const ROWS = [0, 1, 2, 3, 4];

/** Loading shape of the dashboard: table rows on desktop, cards on mobile. */
export function WatchlistSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading watchlist</span>
      <div className="hidden md:block">
        <Skeleton className="mb-2 h-8 w-full" />
        {ROWS.map((row) => (
          <div key={row} className="flex items-center gap-6 border-b border-border px-3 py-1">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="size-10" />
          </div>
        ))}
      </div>
      <div className="space-y-3 md:hidden">
        {ROWS.map((row) => (
          <div key={row} className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
