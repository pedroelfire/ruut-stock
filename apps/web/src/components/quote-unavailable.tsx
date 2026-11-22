'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ErrorState } from '@/components/error-state';
import { RateLimitBanner } from '@/components/rate-limit-banner';
import { useRateLimitAnnouncement } from '@/components/rate-limit-provider';
import { Button } from '@/components/ui/button';
import { useSecondsLeft } from '@/hooks/use-now-seconds';
import { rateLimitAnnouncement } from '@/lib/rate-limit';

interface QuoteUnavailableProps {
  symbol: string;
  reason: 'rate-limited' | 'error';
  /** Epoch milliseconds when a retry makes sense (rate-limited only). */
  retryAt?: number;
}

const MIN_REFRESH_DELAY_MS = 1000;

function RateLimited({ retryAt }: { retryAt: number }) {
  const router = useRouter();
  const secondsLeft = useSecondsLeft(retryAt);
  // Without a quote there is nothing saved to show: the page only has the symbol.
  useRateLimitAnnouncement(rateLimitAnnouncement(false));

  // When the countdown ends, render the page again on the server: the quote comes from there.
  useEffect(() => {
    // At least a second even if `retryAt` has passed (a background tab), so a page that keeps
    // answering 429 cannot refresh in a tight loop.
    const timeout = setTimeout(
      () => router.refresh(),
      Math.max(MIN_REFRESH_DELAY_MS, retryAt - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [retryAt, router]);

  return (
    <RateLimitBanner
      secondsLeft={secondsLeft}
      hasSavedPrices={false}
      action={
        <Button variant="outline" onClick={() => router.refresh()}>
          Try again
        </Button>
      }
    />
  );
}

/**
 * Detail page when the server could not get the quote (spec 03 §4): a 429 shows the limit banner
 * with its countdown, a 502 an error with `Try again`. Neither is ever a "not found".
 */
export function QuoteUnavailable({ symbol, reason, retryAt }: QuoteUnavailableProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight uppercase">{symbol}</h1>
      {reason === 'rate-limited' && retryAt !== undefined ? (
        <RateLimited retryAt={retryAt} />
      ) : (
        <ErrorState
          title={`We couldn't load ${symbol}`}
          description="Market data is unavailable right now. Try again in a moment."
        />
      )}
    </div>
  );
}
