import {
  WATCHLIST_MAX_SYMBOLS,
  addWatchlistItemResponseSchema,
  type Quote,
  type WatchlistResponse,
} from '@ruut/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest, apiSend } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { queryKeys, watchlistQueryOptions } from '@/lib/market-queries';
import { isApiError, isUnauthorized } from '@/lib/query-client';

/** Product copy for a full watchlist (spec 01, H3). */
export const WATCHLIST_FULL_MESSAGE = `Your watchlist is full (${WATCHLIST_MAX_SYMBOLS} symbols). Remove one to add another.`;
const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';
/** Shared by add and remove, so a settling mutation can tell whether others are still running. */
const WATCHLIST_MUTATION_KEY = ['watchlist'] as const;

export interface WatchlistCandidate {
  symbol: string;
  /** Shown in the optimistic row until the refetch brings the stored name. */
  name: string;
}

interface MutationContext {
  previous: WatchlistResponse | undefined;
}

function messageFor(error: unknown): string | null {
  // A 401 is already sending the user to /login; there is nothing to say here.
  if (isUnauthorized(error)) return null;
  if (!isApiError(error)) return FALLBACK_MESSAGE;
  // The API words the full-list conflict differently from the product copy.
  if (error.code === 'CONFLICT' && /full/i.test(error.message)) return WATCHLIST_FULL_MESSAGE;
  return error.message;
}

/**
 * Watchlist membership plus add and remove with optimistic updates (spec 03 §5): the cache
 * changes first, a failure rolls it back, and `['watchlist']` is invalidated either way.
 */
export function useWatchlistActions({ enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const options = watchlistQueryOptions();
  const watchlist = useQuery({ ...options, enabled });
  const [error, setError] = useState<string | null>(null);
  // Tagged with the response type, so getQueryData and setQueryData are typed.
  const key = options.queryKey;

  const rollback = (failure: unknown, context: MutationContext | undefined) => {
    if (context?.previous) queryClient.setQueryData(key, context.previous);
    setError(messageFor(failure));
  };
  const settle = (context: MutationContext | undefined) => {
    // No context means onMutate refused the change (full list): nothing changed, nothing to refetch.
    if (!context) return undefined;
    // Only the last of chained mutations refetches (the settling one still counts): an earlier
    // refetch would bring back a list without the later optimistic changes, and the row flickers.
    if (queryClient.isMutating({ mutationKey: WATCHLIST_MUTATION_KEY }) > 1) return undefined;
    return queryClient.invalidateQueries({ queryKey: key });
  };

  const addMutation = useMutation({
    mutationKey: WATCHLIST_MUTATION_KEY,
    mutationFn: ({ symbol }: WatchlistCandidate) =>
      apiRequest('/api/bff/watchlist', addWatchlistItemResponseSchema, {
        method: 'POST',
        body: { symbol },
      }),
    onMutate: async ({ symbol, name }): Promise<MutationContext> => {
      setError(null);
      await queryClient.cancelQueries({ queryKey: key });
      // Read after the await, like remove: two quick adds would otherwise both start from the same
      // list and the second would drop the first one's optimistic row.
      const previous = queryClient.getQueryData(key);
      // Checked before the request: the API would answer 409 anyway, without the product copy.
      if (previous && previous.data.length >= WATCHLIST_MAX_SYMBOLS) {
        throw new ApiError('CONFLICT', WATCHLIST_FULL_MESSAGE, 409);
      }
      if (previous) {
        const quote = queryClient.getQueryData<Quote>(queryKeys.quote(symbol)) ?? null;
        queryClient.setQueryData(key, {
          ...previous,
          data: [...previous.data, { symbol, name, addedAt: new Date().toISOString(), quote }],
        });
      }
      return { previous };
    },
    onError: (failure, _variables, context) => rollback(failure, context),
    onSettled: (_data, _error, _variables, context) => settle(context),
  });

  const removeMutation = useMutation({
    mutationKey: WATCHLIST_MUTATION_KEY,
    mutationFn: async (symbol: string) => {
      try {
        await apiSend(`/api/bff/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
      } catch (failure) {
        // Already gone (another tab, another device): that is the outcome the user wanted.
        if (isApiError(failure) && failure.code === 'NOT_FOUND') return;
        throw failure;
      }
    },
    onMutate: async (symbol): Promise<MutationContext> => {
      setError(null);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      if (previous) {
        queryClient.setQueryData(key, {
          ...previous,
          data: previous.data.filter((item) => item.symbol !== symbol),
        });
      }
      return { previous };
    },
    onError: (failure, _variables, context) => rollback(failure, context),
    onSettled: (_data, _error, _variables, context) => settle(context),
  });

  const items = watchlist.data?.data;
  return {
    watchlist,
    has: (symbol: string) => items?.some((item) => item.symbol === symbol) ?? false,
    add: (candidate: WatchlistCandidate) => addMutation.mutate(candidate),
    remove: (symbol: string) => removeMutation.mutate(symbol),
    error,
  };
}
