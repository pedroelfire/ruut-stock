import { ListPlus } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/empty-state';

export const metadata: Metadata = { title: 'Watchlist' };

/** Provisional dashboard: Phase 4 replaces the empty state with the real watchlist. */
export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Watchlist</h1>
      <EmptyState
        icon={ListPlus}
        title="Your watchlist is empty"
        description="Search for a stock to add it to your watchlist."
      />
    </div>
  );
}
