import { partialMetaSchema } from '@ruut/shared';
import type { Query, QueryCacheNotifyEvent } from '@tanstack/react-query';
import { z } from 'zod';
import { isRateLimited } from './query-client';

/** Used when a RATE_LIMITED error arrives without `retryAfter`: the provider's window is 1 min. */
export const DEFAULT_RETRY_AFTER_SECONDS = 60;

const partialResponseSchema = z.object({ meta: partialMetaSchema });

/**
 * Seconds the global banner should count down for this cache event, or null when it does not
 * concern the banner. Two triggers (spec 03 §5): a RATE_LIMITED error, and a successful response
 * whose `meta.partial` says some items were left out for lack of credits. Queries marked with
 * `meta.silentRateLimit` (sparklines) never count.
 */
export function retryAfterFromQueryEvent(event: QueryCacheNotifyEvent): number | null {
  if (event.type !== 'updated') return null;
  if (event.query.meta?.silentRateLimit) return null;

  const { action } = event;
  if (action.type === 'error' && isRateLimited(action.error)) {
    return action.error.retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS;
  }
  if (action.type === 'success') {
    const partial = partialResponseSchema.safeParse(action.data);
    if (partial.success) return partial.data.meta.retryAfter;
  }
  return null;
}

/**
 * Whether the screen is showing saved prices while the limit lasts: some query that is on screen
 * (active) and holds prices already has data. Decides the banner copy (conventions §6).
 */
export function hasSavedPrices(queries: readonly Query[]): boolean {
  return queries.some(
    (query) =>
      query.meta?.showsPrices === true && query.isActive() && query.state.data !== undefined,
  );
}

export const RATE_LIMIT_TITLE = 'Data limit reached';

/** Banner description before the countdown (conventions §6). */
export function rateLimitDescription(savedPrices: boolean): string {
  return savedPrices ? 'Showing the last saved prices.' : 'No saved prices yet.';
}

/** What the live region reads out: no countdown, or it would be announced every second. */
export function rateLimitAnnouncement(savedPrices: boolean): string {
  return `${RATE_LIMIT_TITLE}. ${rateLimitDescription(savedPrices)}`;
}
