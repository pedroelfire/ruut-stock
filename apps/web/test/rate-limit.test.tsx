// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalRateLimitBanner, RateLimitProvider } from '@/components/rate-limit-provider';
import { ApiError } from '@/lib/api-error';

const WATCHLIST_META = { showsPrices: true };

function renderBanner(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <RateLimitProvider>
        <GlobalRateLimitBanner />
      </RateLimitProvider>
    </QueryClientProvider>,
  );
}

/** Subscribes an observer so the query is active, as a mounted component would. */
function observe(client: QueryClient, options: ConstructorParameters<typeof QueryObserver>[1]) {
  const observer = new QueryObserver(client, { retry: false, ...options });
  return observer.subscribe(() => {});
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('RateLimitProvider', () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient();
  });

  afterEach(() => {
    client.clear();
    vi.useRealTimers();
  });

  it('shows the banner with a countdown on RATE_LIMITED and refetches active queries at zero', async () => {
    const watchlistFn = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('RATE_LIMITED', 'Limit', 429, 3))
      .mockResolvedValue({ data: [] });
    const sparklineFn = vi.fn().mockResolvedValue({ points: [] });
    renderBanner(client);
    observe(client, { queryKey: ['watchlist'], queryFn: watchlistFn, meta: WATCHLIST_META });
    observe(client, {
      queryKey: ['sparkline', 'AAPL'],
      queryFn: sparklineFn,
      meta: { silentRateLimit: true },
    });
    await flush();

    expect(screen.getByText('Data limit reached')).toBeInTheDocument();
    expect(screen.getByText('Retrying in 3 s.')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(watchlistFn).toHaveBeenCalledTimes(2);
    // Silent queries retry on their own schedule; the banner never refetches them.
    expect(sparklineFn).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Data limit reached')).not.toBeInTheDocument();
  });

  it('ignores rate limits on silent queries (sparklines)', async () => {
    renderBanner(client);
    observe(client, {
      queryKey: ['sparkline', 'AAPL'],
      queryFn: () => Promise.reject(new ApiError('RATE_LIMITED', 'Limit', 429, 30)),
      meta: { silentRateLimit: true },
    });
    await flush();

    expect(screen.queryByText('Data limit reached')).not.toBeInTheDocument();
  });

  it('shows the banner for a successful response with meta.partial', async () => {
    renderBanner(client);
    observe(client, {
      queryKey: ['watchlist'],
      queryFn: () => Promise.resolve({ data: [], meta: { partial: true, retryAfter: 20 } }),
      meta: WATCHLIST_META,
    });
    await flush();

    expect(screen.getByText('Retrying in 20 s.')).toBeInTheDocument();
    expect(screen.getByText('Showing the last saved prices.')).toBeInTheDocument();
  });

  it('says there are no saved prices when the limited view has nothing cached', async () => {
    renderBanner(client);
    observe(client, {
      queryKey: ['watchlist'],
      queryFn: () => Promise.reject(new ApiError('RATE_LIMITED', 'Limit', 429, 42)),
      meta: WATCHLIST_META,
    });
    await flush();

    expect(screen.getByText('No saved prices yet.')).toBeInTheDocument();
    expect(screen.getByText('Retrying in 42 s.')).toBeInTheDocument();
    expect(screen.queryByText('Showing the last saved prices.')).not.toBeInTheDocument();
  });

  it('says it shows the last saved prices when a refetch is limited but data is cached', async () => {
    client.setQueryData(['watchlist'], { data: [] });
    renderBanner(client);
    observe(client, {
      queryKey: ['watchlist'],
      queryFn: () => Promise.reject(new ApiError('RATE_LIMITED', 'Limit', 429, 42)),
      meta: WATCHLIST_META,
    });
    await flush();

    expect(screen.getByText('Showing the last saved prices.')).toBeInTheDocument();
  });

  it('does not count data that is not prices, such as search results', async () => {
    client.setQueryData(['search', 'app'], [{ symbol: 'AAPL' }]);
    renderBanner(client);
    observe(client, { queryKey: ['search', 'app'], queryFn: () => Promise.resolve([]) });
    observe(client, {
      queryKey: ['watchlist'],
      queryFn: () => Promise.reject(new ApiError('RATE_LIMITED', 'Limit', 429, 42)),
      meta: WATCHLIST_META,
    });
    await flush();

    expect(screen.getByText('No saved prices yet.')).toBeInTheDocument();
  });

  it('announces through a live region that is mounted before the limit and emptied after it', async () => {
    renderBanner(client);
    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toBeEmptyDOMElement();

    observe(client, {
      queryKey: ['watchlist'],
      queryFn: vi
        .fn()
        .mockRejectedValueOnce(new ApiError('RATE_LIMITED', 'Limit', 429, 2))
        .mockResolvedValue({ data: [] }),
      meta: WATCHLIST_META,
    });
    await flush();

    // Same node: screen readers only announce changes to a region that already existed.
    expect(screen.getByRole('status')).toBe(liveRegion);
    expect(liveRegion).toHaveTextContent('Data limit reached. No saved prices yet.');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(liveRegion).toBeEmptyDOMElement();
  });

  it('does not react to other errors', async () => {
    renderBanner(client);
    observe(client, {
      queryKey: ['watchlist'],
      queryFn: () => Promise.reject(new ApiError('UPSTREAM_ERROR', 'Down', 502)),
    });
    await flush();

    expect(screen.queryByText('Data limit reached')).not.toBeInTheDocument();
  });
});
