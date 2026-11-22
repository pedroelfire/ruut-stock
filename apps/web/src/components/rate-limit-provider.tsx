'use client';

import { notifyManager, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { RateLimitBanner } from '@/components/rate-limit-banner';
import { useSecondsLeft } from '@/hooks/use-now-seconds';
import { hasSavedPrices, rateLimitAnnouncement, retryAfterFromQueryEvent } from '@/lib/rate-limit';

interface RateLimitContextValue {
  /** Epoch milliseconds when the banner's countdown ends, or null when there is no banner. */
  deadline: number | null;
  /** Whether saved prices are on screen, which picks the banner copy (conventions §6). */
  hasSavedPrices: boolean;
  /** Fills the live region for a banner the provider does not own (detail page 429). */
  announce: (message: string | null) => void;
}

const RateLimitContext = createContext<RateLimitContextValue>({
  deadline: null,
  hasSavedPrices: false,
  announce: () => {},
});

/** A `retryAfter` of 0 would refetch in a tight loop if the next answer is partial again. */
const MIN_COUNTDOWN_MS = 1000;

/** Re-evaluated on every cache change; the snapshot is a boolean, so React bails out cheaply. */
function useHasSavedPrices(): boolean {
  const queryCache = useQueryClient().getQueryCache();
  const subscribe = useCallback(
    // Batched like TanStack's own hooks: cache events can fire while another component renders.
    (onChange: () => void) => queryCache.subscribe(notifyManager.batchCalls(onChange)),
    [queryCache],
  );
  return useSyncExternalStore(
    subscribe,
    () => hasSavedPrices(queryCache.getAll()),
    () => false,
  );
}

/**
 * Watches the query cache (spec 03 §5): a RATE_LIMITED error or a `meta.partial` response starts
 * (or extends) a countdown; when it ends, every active query is refetched except the silent ones
 * (sparklines), which retry on their own. It also owns a live region that stays mounted, so the
 * announcement is read out when it gets filled.
 */
export function RateLimitProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [deadline, setDeadline] = useState<number | null>(null);
  const [localAnnouncement, setLocalAnnouncement] = useState<string | null>(null);
  const savedPrices = useHasSavedPrices();

  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        const seconds = retryAfterFromQueryEvent(event);
        if (seconds === null) return;
        const next = Date.now() + Math.max(seconds * 1000, MIN_COUNTDOWN_MS);
        setDeadline((current) => (current !== null && current > next ? current : next));
      }),
    [queryClient],
  );

  useEffect(() => {
    if (deadline === null) return;
    const timeout = setTimeout(
      () => {
        setDeadline(null);
        void queryClient.refetchQueries({
          type: 'active',
          predicate: (query) => !query.meta?.silentRateLimit,
        });
      },
      Math.max(0, deadline - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [deadline, queryClient]);

  const value = useMemo(
    () => ({ deadline, hasSavedPrices: savedPrices, announce: setLocalAnnouncement }),
    [deadline, savedPrices],
  );
  const announcement =
    deadline !== null ? rateLimitAnnouncement(savedPrices) : (localAnnouncement ?? '');

  return (
    <RateLimitContext.Provider value={value}>
      {children}
      <div role="status" className="sr-only">
        {announcement}
      </div>
    </RateLimitContext.Provider>
  );
}

/** Reads `message` out through the provider's live region while the caller is mounted. */
export function useRateLimitAnnouncement(message: string): void {
  const { announce } = useContext(RateLimitContext);
  useEffect(() => {
    announce(message);
    return () => announce(null);
  }, [announce, message]);
}

function CountdownBanner({
  deadline,
  hasSavedPrices: savedPrices,
  className,
}: {
  deadline: number;
  hasSavedPrices: boolean;
  className?: string;
}) {
  const secondsLeft = useSecondsLeft(deadline);
  return (
    <RateLimitBanner secondsLeft={secondsLeft} hasSavedPrices={savedPrices} className={className} />
  );
}

/** The global banner, placed once at the top of the page content. */
export function GlobalRateLimitBanner({ className }: { className?: string }) {
  const { deadline, hasSavedPrices: savedPrices } = useContext(RateLimitContext);
  if (deadline === null) return null;
  return <CountdownBanner deadline={deadline} hasSavedPrices={savedPrices} className={className} />;
}
