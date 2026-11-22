'use client';

import { TriangleAlert } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { RATE_LIMIT_TITLE, rateLimitDescription } from '@/lib/rate-limit';
import { cn } from '@/lib/utils';

interface RateLimitBannerProps {
  secondsLeft: number;
  /** Whether saved prices are on screen meanwhile; it changes the description (conventions §6). */
  hasSavedPrices: boolean;
  /** Optional action, such as `Try again` on the detail page. */
  action?: ReactNode;
  className?: string;
}

/**
 * "Data limit reached" banner (conventions §6): --warning-subtle background with text, icon and
 * border in --warning. It is not a live region itself: a region mounted together with its text is
 * often skipped by screen readers, so RateLimitProvider keeps a persistent one and fills it.
 */
export function RateLimitBanner({
  secondsLeft,
  hasSavedPrices,
  action,
  className,
}: RateLimitBannerProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-lg border border-warning bg-warning-subtle px-4 py-3 text-warning',
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p id={titleId} className="text-sm font-semibold">
          {RATE_LIMIT_TITLE}
        </p>
        <p className="text-sm">
          {rateLimitDescription(hasSavedPrices)}{' '}
          <span className="tabular-nums" suppressHydrationWarning>
            {secondsLeft > 0 ? `Retrying in ${secondsLeft} s.` : 'Retrying now.'}
          </span>
        </p>
      </div>
      {action}
    </section>
  );
}
