// @vitest-environment jsdom
import type { Series } from '@ruut/shared';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSparklines } from '@/hooks/use-sparklines';
import { ApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/market-queries';

const SYMBOLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function series(symbol: string): Series {
  return {
    symbol,
    range: '1M',
    points: [],
    periodChange: 0,
    periodChangePercent: 0,
    asOf: '2026-11-20T00:00:00.000Z',
    stale: false,
  };
}

/** Requests never settle: every call stays in flight, so the count is the concurrency. */
function stubPendingFetch() {
  const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mount(client: QueryClient, enabled = true) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSparklines(SYMBOLS, enabled), { wrapper });
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('useSparklines', () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient();
  });

  afterEach(() => {
    client.clear();
    onlineManager.setOnline(true);
    focusManager.setFocused(undefined);
    vi.useRealTimers();
  });

  it('never has more than two requests in flight on a cold load', async () => {
    const fetchMock = stubPendingFetch();
    mount(client);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not refetch cached or failed sparklines on remount, focus or reconnect', async () => {
    const fetchMock = stubPendingFetch();
    // Half of them cached two hours ago (past the API TTL), half failed for good.
    SYMBOLS.slice(0, 4).forEach((symbol) =>
      client.setQueryData(queryKeys.sparkline(symbol), series(symbol), {
        updatedAt: Date.now() - TWO_HOURS_MS,
      }),
    );
    await Promise.all(
      SYMBOLS.slice(4).map((symbol) =>
        client
          .prefetchQuery({
            queryKey: queryKeys.sparkline(symbol),
            queryFn: () => Promise.reject(new ApiError('UPSTREAM_ERROR', 'Down', 502)),
            retry: false,
          })
          .catch(() => {}),
      ),
    );

    mount(client);
    await flush();
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
