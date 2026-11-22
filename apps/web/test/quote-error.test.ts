import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { classifyQuoteError } from '@/lib/quote-error';
import { DEFAULT_RETRY_AFTER_SECONDS } from '@/lib/rate-limit';

describe('classifyQuoteError', () => {
  it('treats only a 404 as a symbol that does not exist', () => {
    expect(classifyQuoteError(new ApiError('NOT_FOUND', 'Symbol not found', 404))).toBe(
      'not-found',
    );
  });

  it('counts down the retryAfter of a 429', () => {
    expect(classifyQuoteError(new ApiError('RATE_LIMITED', 'Limit', 429, 42))).toEqual({
      rateLimitedFor: 42,
    });
  });

  it('falls back to the one-minute window when a 429 has no retryAfter', () => {
    expect(classifyQuoteError(new ApiError('RATE_LIMITED', 'Limit', 429))).toEqual({
      rateLimitedFor: DEFAULT_RETRY_AFTER_SECONDS,
    });
  });

  it('waits at least a second, so retryAfter 0 cannot loop', () => {
    expect(classifyQuoteError(new ApiError('RATE_LIMITED', 'Limit', 429, 0))).toEqual({
      rateLimitedFor: 1,
    });
  });

  it('never turns an upstream, network or server failure into a not found', () => {
    expect(classifyQuoteError(new ApiError('UPSTREAM_ERROR', 'Down', 502))).toBe('error');
    // apiServer maps a network failure to UPSTREAM_ERROR; status 0 is the client-side variant.
    expect(classifyQuoteError(new ApiError('UPSTREAM_ERROR', 'Offline', 0))).toBe('error');
    expect(classifyQuoteError(new ApiError('INTERNAL_ERROR', 'Boom', 500))).toBe('error');
  });
});
