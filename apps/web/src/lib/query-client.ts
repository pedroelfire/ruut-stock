import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-error';

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: {
      /** Rate limits on this query never reach the global banner (sparklines, spec 03 §5). */
      silentRateLimit?: boolean;
      /**
       * Its data is shown on screen as prices (watchlist, quote, series): while one of these has
       * data, the rate limit banner says it is showing the last saved prices (conventions §6).
       */
      showsPrices?: boolean;
    };
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** A 401 from the BFF always means the session is no longer valid (spec 03 §5). */
export function isUnauthorized(error: unknown): boolean {
  return isApiError(error) && error.status === 401;
}

export function isRateLimited(error: unknown): error is ApiError {
  return isApiError(error) && error.code === 'RATE_LIMITED';
}

/**
 * Default retry policy (spec 03 §5): never on a 4xx (429 included: the banner retries when the
 * countdown ends), once on a 5xx or a network failure (status 0).
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export interface QueryClientOptions {
  onUnauthorized: () => void;
}

export function createQueryClient({ onUnauthorized }: QueryClientOptions): QueryClient {
  const handleError = (error: unknown) => {
    if (isUnauthorized(error)) onUnauthorized();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 60_000 },
      mutations: { retry: false },
    },
  });
}
