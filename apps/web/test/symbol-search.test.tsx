// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SymbolSearch } from '@/components/symbol-search';
import { SymbolSearchProvider } from '@/components/symbol-search-context';
import { jsonResponse } from './helpers';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const results = [
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', type: 'Common Stock' },
  { symbol: 'APP', name: 'AppLovin Corporation', exchange: 'NASDAQ', type: 'Common Stock' },
  { symbol: 'APPF', name: 'AppFolio Inc.', exchange: 'NASDAQ', type: 'Common Stock' },
];

const watchlist = {
  data: [
    {
      symbol: 'APP',
      name: 'AppLovin Corporation',
      addedAt: '2026-11-20T00:00:00.000Z',
      quote: null,
    },
  ],
};

function stubBrowser() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: true, // desktop: the popover variant
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // cmdk scrolls the selected option into view; jsdom does not implement it.
  Element.prototype.scrollIntoView = vi.fn();
}

function mockApi() {
  const fetchMock = vi.fn<typeof fetch>((input) => {
    const url = String(input);
    if (url.startsWith('/api/bff/market/search')) {
      return Promise.resolve(jsonResponse({ data: results }));
    }
    if (url === '/api/bff/watchlist') return Promise.resolve(jsonResponse(watchlist));
    return Promise.reject(new Error(`Unexpected request to ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderSearch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SymbolSearchProvider>
        <SymbolSearch />
      </SymbolSearchProvider>
    </QueryClientProvider>,
  );
}

const selectedOption = () =>
  screen.getAllByRole('option').find((option) => option.getAttribute('aria-selected') === 'true');

describe('SymbolSearch', () => {
  beforeEach(() => {
    router.push.mockReset();
    stubBrowser();
  });

  it('opens with Ctrl+K, debounces the query and navigates with the arrows and Enter', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    renderSearch();

    await user.keyboard('{Control>}k{/Control}');
    const input = await screen.findByRole('combobox', { name: 'Search symbols' });
    expect(input).toHaveFocus();

    await user.type(input, 'app');
    await screen.findByRole('option', { name: /AAPL/ });

    // One request for the final text, none for "a" or "ap".
    const searches = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.startsWith('/api/bff/market/search'));
    expect(searches).toEqual(['/api/bff/market/search?q=app']);

    expect(selectedOption()).toHaveTextContent('AAPL');
    await user.keyboard('{ArrowDown}');
    expect(selectedOption()).toHaveTextContent('APP');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    // The list loops back to the first result.
    expect(selectedOption()).toHaveTextContent('AAPL');
    await user.keyboard('{ArrowUp}');
    expect(selectedOption()).toHaveTextContent('APPF');

    await user.keyboard('{Enter}');
    expect(router.push).toHaveBeenCalledWith('/stocks/APPF');
    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
  });

  it('closes with Escape and gives focus back to the trigger', async () => {
    mockApi();
    const user = userEvent.setup();
    renderSearch();

    const trigger = screen.getByRole('button', { name: /Search symbol…/ });
    await user.click(trigger);
    await screen.findByRole('combobox');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('marks symbols already in the watchlist and offers to add the rest', async () => {
    mockApi();
    const user = userEvent.setup();
    renderSearch();

    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('combobox'), 'app');

    expect(await screen.findByText('APP is in your watchlist')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add AAPL to watchlist' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add APP to watchlist' })).not.toBeInTheDocument();
  });

  it('explains when nothing matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>((input) =>
        Promise.resolve(
          jsonResponse(String(input) === '/api/bff/watchlist' ? watchlist : { data: [] }),
        ),
      ),
    );
    const user = userEvent.setup();
    renderSearch();

    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('combobox'), 'xyz');

    expect(await screen.findByText('No results for "xyz"')).toBeInTheDocument();
    expect(screen.getByText('Try the ticker symbol, like AAPL.')).toBeInTheDocument();
  });
});
