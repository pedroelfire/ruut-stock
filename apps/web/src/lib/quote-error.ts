import type { ApiError } from './api-error';
import { DEFAULT_RETRY_AFTER_SECONDS } from './rate-limit';

/** A `retryAfter` of 0 would re-render the page on the server in a tight loop. */
export const MIN_QUOTE_RETRY_SECONDS = 1;

export type QuoteErrorOutcome = 'not-found' | { rateLimitedFor: number } | 'error';

/**
 * What the detail page does when the server-side quote fails (spec 03 §4). Only a 404 means the
 * symbol does not exist: a 429 shows the limit banner for `rateLimitedFor` seconds, and anything
 * else (502, network failure, 500) is a retryable error, never a "not found".
 */
export function classifyQuoteError(error: ApiError): QuoteErrorOutcome {
  if (error.code === 'NOT_FOUND') return 'not-found';
  if (error.code === 'RATE_LIMITED') {
    const seconds = error.retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS;
    return { rateLimitedFor: Math.max(MIN_QUOTE_RETRY_SECONDS, seconds) };
  }
  return 'error';
}
