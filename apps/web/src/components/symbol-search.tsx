'use client';

import { SEARCH_QUERY_MAX_LENGTH, type SearchResult } from '@ruut/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus, Search, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSymbolSearch } from '@/components/symbol-search-context';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/hooks/use-debounce';
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/use-media-query';
import { useWatchlistActions } from '@/hooks/use-watchlist-actions';
import { searchQueryOptions } from '@/lib/market-queries';
import { isRateLimited } from '@/lib/query-client';
import { stockPath } from '@/lib/routes';
import { cn } from '@/lib/utils';

export const SEARCH_DEBOUNCE_MS = 300;

const noopSubscribe = () => () => {};
const isApplePlatform = () => /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Header search (spec 03 §4, H2): a popover under the trigger on desktop and a full-screen dialog
 * on mobile, opened by click, by `⌘K` / `Ctrl+K` or by any page through useSymbolSearch().
 */
export function SymbolSearch() {
  const { open, setOpen } = useSymbolSearch();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  // Server render and hydration use "Ctrl"; Apple devices switch to "⌘" right after.
  const isApple = useSyncExternalStore(noopSubscribe, isApplePlatform, () => false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpen(!open);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, setOpen]);

  const close = () => setOpen(false);

  return (
    <>
      <Popover open={open && isDesktop} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-keyshortcuts="Meta+K Control+K"
            className="hidden h-10 w-full max-w-sm items-center gap-2 rounded-md border border-input bg-surface px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:inline-flex"
          >
            <Search className="size-4" aria-hidden="true" />
            <span className="flex-1 text-left">Search symbol…</span>
            <kbd className="rounded-sm border border-border bg-background px-1.5 font-sans text-xs">
              {isApple ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          className="w-(--radix-popover-trigger-width) min-w-96 p-0"
          aria-label="Search symbols"
        >
          <SearchPanel onNavigate={close} />
        </PopoverContent>
      </Popover>

      <Dialog open={open && !isDesktop} onOpenChange={setOpen}>
        {/* As the dialog's trigger, the icon button gets the focus back when the dialog closes. */}
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="Search symbols"
            aria-keyshortcuts="Meta+K Control+K"
            className="md:hidden"
          >
            <Search className="size-5" aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent className="top-0 left-0 flex h-dvh max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none">
          <DialogTitle className="sr-only">Search symbols</DialogTitle>
          <DialogDescription className="sr-only">
            Search US stocks and ETFs by ticker or company name.
          </DialogDescription>
          <SearchPanel
            onNavigate={close}
            className="min-h-0 flex-1 **:data-[slot=command-input-wrapper]:h-14 **:data-[slot=command-input-wrapper]:pr-14"
            fullScreen
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

interface SearchPanelProps {
  onNavigate: () => void;
  className?: string;
  fullScreen?: boolean;
}

/** The input and the results, shared by the popover and the dialog. */
export function SearchPanel({ onNavigate, className, fullScreen = false }: SearchPanelProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState('');
  const query = useDebounce(input.trim(), SEARCH_DEBOUNCE_MS);
  const search = useQuery(searchQueryOptions(query));
  const watchlist = useWatchlistActions();

  const typed = input.trim();
  const settled = typed === query && !search.isPlaceholderData && !search.isFetching;
  const results = typed && query ? (search.data ?? []) : [];

  function openResult(symbol: string) {
    onNavigate();
    router.push(stockPath(symbol));
  }

  function addResult(result: SearchResult) {
    watchlist.add({ symbol: result.symbol, name: result.name });
    // The click moved focus to the button; arrows and Enter keep working from the input.
    inputRef.current?.focus();
  }

  return (
    <Command
      shouldFilter={false}
      loop
      label="Search symbols"
      className={cn('bg-popover', className)}
    >
      <CommandInput
        ref={inputRef}
        value={input}
        onValueChange={setInput}
        placeholder="Search by ticker or company"
        // The API rejects longer queries with a 400, which would read as a connection error.
        maxLength={SEARCH_QUERY_MAX_LENGTH}
        autoFocus
      />
      <CommandList className={cn(fullScreen ? 'max-h-none flex-1' : 'max-h-96')}>
        {!typed ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Type a ticker or company name, like AAPL or Apple.
          </p>
        ) : search.isError && results.length === 0 ? (
          <SearchError rateLimited={isRateLimited(search.error)} onRetry={search.refetch} />
        ) : results.length === 0 && !settled ? (
          <ResultsSkeleton />
        ) : (
          <>
            <CommandEmpty className="px-3 py-6 text-center">
              <p className="text-sm font-medium">{`No results for "${query}"`}</p>
              <p className="text-sm text-muted-foreground">Try the ticker symbol, like AAPL.</p>
            </CommandEmpty>
            {results.length > 0 ? (
              <CommandGroup>
                {results.map((result) => (
                  <ResultRow
                    key={`${result.symbol}:${result.exchange}`}
                    result={result}
                    inWatchlist={watchlist.has(result.symbol)}
                    onOpen={() => openResult(result.symbol)}
                    onAdd={() => addResult(result)}
                  />
                ))}
              </CommandGroup>
            ) : null}
          </>
        )}
      </CommandList>
      {watchlist.error ? (
        <p role="status" className="border-t border-border px-3 py-2 text-sm text-muted-foreground">
          {watchlist.error}
        </p>
      ) : null}
    </Command>
  );
}

interface ResultRowProps {
  result: SearchResult;
  inWatchlist: boolean;
  onOpen: () => void;
  onAdd: () => void;
}

/**
 * The option opens the detail; the add button sits next to it, not inside it, so it is a
 * separate control for assistive technology instead of a button nested in an option.
 */
function ResultRow({ result, inWatchlist, onOpen, onAdd }: ResultRowProps) {
  return (
    <div className="flex items-center gap-1">
      <CommandItem
        value={`${result.symbol}:${result.exchange}`}
        onSelect={onOpen}
        className="group min-h-12 min-w-0 flex-1 gap-3"
      >
        <span className="w-16 shrink-0 font-semibold tracking-tight uppercase">
          {result.symbol}
        </span>
        <span className="min-w-0 flex-1 truncate">{result.name}</span>
        {/* --muted-foreground on the highlighted item (--border) falls below AA (conventions §2). */}
        <span className="shrink-0 text-xs text-muted-foreground group-data-[selected=true]:text-foreground">
          {result.exchange}
        </span>
      </CommandItem>
      {inWatchlist ? (
        <span
          className="flex size-10 shrink-0 items-center justify-center text-primary"
          title="In your watchlist"
        >
          <Check className="size-5" aria-hidden="true" />
          <span className="sr-only">{`${result.symbol} is in your watchlist`}</span>
        </span>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={`Add ${result.symbol} to watchlist`}
          onClick={onAdd}
        >
          <Plus className="size-5" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-1 p-1" aria-busy="true">
      <span className="sr-only">Loading results</span>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex min-h-12 items-center gap-3 px-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-10" />
        </div>
      ))}
    </div>
  );
}

function SearchError({ rateLimited, onRetry }: { rateLimited: boolean; onRetry: () => void }) {
  if (rateLimited) {
    // The limit keeps its §6 treatment inside the panel: --warning-subtle with --warning text.
    return (
      <div
        role="alert"
        className="m-2 flex items-start gap-2 rounded-lg border border-warning bg-warning-subtle px-3 py-3 text-left text-sm text-warning"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="space-y-0.5">
          <p className="font-semibold">Data limit reached</p>
          <p>Search will be available again in a moment.</p>
        </div>
      </div>
    );
  }
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-3 py-6 text-center">
      <p className="text-sm font-medium">{"We couldn't search right now"}</p>
      <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
