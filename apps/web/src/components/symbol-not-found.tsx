'use client';

import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

function displaySymbol(segment: string | string[] | undefined): string {
  const value = Array.isArray(segment) ? segment[0] : segment;
  if (!value) return '';
  try {
    return decodeURIComponent(value).toUpperCase();
  } catch {
    return value.toUpperCase();
  }
}

/** H4: "We couldn't find "XYZ"" with a way back to the watchlist. */
export function SymbolNotFound() {
  const params = useParams<{ symbol: string }>();
  const symbol = displaySymbol(params.symbol);

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-12 text-center">
      <SearchX className="size-6 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {symbol ? `We couldn't find "${symbol}"` : "We couldn't find that stock"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Check the ticker symbol or search for another stock.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Go to watchlist
      </Link>
    </div>
  );
}
