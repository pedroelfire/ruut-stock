// @vitest-environment jsdom
import type { WatchlistResponse } from '@ruut/shared';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WATCHLIST_FULL_MESSAGE, useWatchlistActions } from '@/hooks/use-watchlist-actions';
import { ApiError } from '@/lib/api-error';
import { createQueryClient } from '@/lib/query-client';
import { jsonResponse } from './helpers';

function item(symbol: string) {
  return { symbol, name: `${symbol} Inc.`, addedAt: '2026-11-20T00:00:00.000Z', quote: null };
}

function setup(initial: WatchlistResponse) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['watchlist'], initial);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useWatchlistActions(), { wrapper });
  const symbols = () =>
    client.getQueryData<WatchlistResponse>(['watchlist'])?.data.map((entry) => entry.symbol);
  return { client, hook, symbols };
}

describe('useWatchlistActions', () => {
  it('adds optimistically and rolls back with the API message when the request fails', async () => {
    let rejectPost: (response: Response) => void = () => {};
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      if (init?.method === 'POST') {
        return new Promise<Response>((resolve) => {
          rejectPost = resolve;
        });
      }
      return Promise.resolve(jsonResponse({ data: [item('AAPL')] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { hook, symbols } = setup({ data: [item('AAPL')] });

    act(() => hook.result.current.add({ symbol: 'MSFT', name: 'Microsoft' }));
    await waitFor(() => expect(symbols()).toEqual(['AAPL', 'MSFT']));

    rejectPost(
      jsonResponse(
        { error: { code: 'RATE_LIMITED', message: 'Market data limit reached.', retryAfter: 9 } },
        { status: 429 },
      ),
    );
    await waitFor(() => expect(hook.result.current.error).toBe('Market data limit reached.'));
    expect(symbols()).toEqual(['AAPL']);
  });

  it('removes optimistically and treats an already deleted symbol as removed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>((_input, init) =>
        Promise.resolve(
          init?.method === 'DELETE'
            ? jsonResponse(
                { error: { code: 'NOT_FOUND', message: 'Not in watchlist' } },
                { status: 404 },
              )
            : jsonResponse({ data: [item('AAPL')] }),
        ),
      ),
    );
    const { client, hook, symbols } = setup({ data: [item('AAPL'), item('MSFT')] });

    act(() => hook.result.current.remove('MSFT'));
    await waitFor(() => expect(symbols()).toEqual(['AAPL']));
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(hook.result.current.error).toBeNull();
  });

  it('refetches once, after the last of chained mutations, so the list does not flicker', async () => {
    const posts: Array<() => void> = [];
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      if (init?.method === 'POST') {
        return new Promise<Response>((resolve) => {
          posts.push(() => resolve(jsonResponse({ data: item('X') }, { status: 201 })));
        });
      }
      return Promise.resolve(jsonResponse({ data: [item('AAPL'), item('MSFT'), item('NVDA')] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { client, hook, symbols } = setup({ data: [item('AAPL')] });
    const watchlistGets = () =>
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'GET').length;

    act(() => hook.result.current.add({ symbol: 'MSFT', name: 'Microsoft' }));
    act(() => hook.result.current.add({ symbol: 'NVDA', name: 'NVIDIA' }));
    await waitFor(() => expect(posts).toHaveLength(2));

    // The first one settles while the second is still running: no refetch yet.
    posts[0]?.();
    await waitFor(() => expect(client.isMutating()).toBe(1));
    expect(watchlistGets()).toBe(0);
    expect(symbols()).toEqual(['AAPL', 'MSFT', 'NVDA']);

    posts[1]?.();
    await waitFor(() => expect(client.isMutating()).toBe(0));
    await waitFor(() => expect(watchlistGets()).toBe(1));
  });

  it('refuses to add a ninth symbol without calling the API', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse({ data: [] })));
    vi.stubGlobal('fetch', fetchMock);
    const full = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(item);
    const { hook, symbols } = setup({ data: full });

    act(() => hook.result.current.add({ symbol: 'NVDA', name: 'NVIDIA' }));

    await waitFor(() => expect(hook.result.current.error).toBe(WATCHLIST_FULL_MESSAGE));
    expect(symbols()).toHaveLength(8);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('reports a 401 from any query so the session can be closed', async () => {
    const onUnauthorized = vi.fn();
    const client = createQueryClient({ onUnauthorized });
    const observer = new QueryObserver(client, {
      queryKey: ['watchlist'],
      queryFn: () => Promise.reject(new ApiError('UNAUTHORIZED', 'Expired', 401)),
    });
    const unsubscribe = observer.subscribe(() => {});

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
    unsubscribe();
    client.clear();
  });
});
