import type { Metadata } from 'next';
import { WatchlistView } from '@/components/watchlist-view';

export const metadata: Metadata = { title: 'Watchlist' };

/** Dashboard: the watchlist loads in the client so it can poll, update optimistically and retry. */
export default function DashboardPage() {
  return <WatchlistView />;
}
