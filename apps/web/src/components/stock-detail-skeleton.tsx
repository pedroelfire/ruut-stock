import { Skeleton } from '@/components/ui/skeleton';

/** Chart area while the series loads: same height as the chart, so nothing jumps. */
export function ChartSkeleton() {
  return <Skeleton className="h-80 w-full md:h-105" aria-hidden="true" />;
}

/** Loading shape of the detail page, in the fixed order of conventions §5. */
export function StockDetailSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      <span className="sr-only">Loading stock</span>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-44" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-11 w-64" />
      <ChartSkeleton />
      <div className="space-y-3">
        <Skeleton className="h-6 w-28" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((cell) => (
            <Skeleton key={cell} className="h-20" />
          ))}
        </div>
      </div>
    </div>
  );
}
