import { quoteResponseSchema, symbolSchema, type Quote } from '@ruut/shared';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { QuoteUnavailable } from '@/components/quote-unavailable';
import { StockDetail } from '@/components/stock-detail';
import { ApiError } from '@/lib/api-error';
import { apiServer } from '@/lib/api-server';
import { classifyQuoteError } from '@/lib/quote-error';
import { stockPath } from '@/lib/routes';
import { firstParam } from '@/lib/search-params';

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** `aapl` → `AAPL`; null when the segment cannot be a ticker (it would be a 400 in the API). */
function normalizeSymbol(segment: string): string | null {
  const parsed = symbolSchema.safeParse(safeDecode(segment));
  return parsed.success ? parsed.data : null;
}

type QuoteResult =
  | { status: 'ok'; quote: Quote }
  | { status: 'rate-limited'; retryAt: number }
  | { status: 'error' };

/** Only a 404 means "does not exist"; a 429 or a 502 must never become notFound() (spec 03 §4). */
async function loadQuote(symbol: string): Promise<QuoteResult> {
  try {
    const params = new URLSearchParams({ symbols: symbol });
    const response = await apiServer(`market/quote?${params.toString()}`, quoteResponseSchema);
    const quote = response.data.find((item) => item.symbol === symbol) ?? response.data[0];
    if (!quote) notFound();
    return { status: 'ok', quote };
  } catch (error) {
    // redirect() and notFound() throw on purpose; only API failures are handled here.
    if (!(error instanceof ApiError)) throw error;
    const outcome = classifyQuoteError(error);
    if (outcome === 'not-found') notFound();
    if (outcome === 'error') return { status: 'error' };
    return { status: 'rate-limited', retryAt: Date.now() + outcome.rateLimitedFor * 1000 };
  }
}

export async function generateMetadata({
  params,
}: PageProps<'/stocks/[symbol]'>): Promise<Metadata> {
  const { symbol } = await params;
  return { title: normalizeSymbol(symbol) ?? 'Stock not found' };
}

export default async function StockPage({ params, searchParams }: PageProps<'/stocks/[symbol]'>) {
  const { symbol: segment } = await params;
  const symbol = normalizeSymbol(segment);
  if (!symbol) notFound();
  // One canonical URL per symbol (`/stocks/aapl` → `/stocks/AAPL`), keeping the chosen range.
  if (symbol !== safeDecode(segment)) {
    const range = firstParam(await searchParams, 'range');
    const query = range ? `?${new URLSearchParams({ range }).toString()}` : '';
    redirect(`${stockPath(symbol)}${query}`);
  }

  const result = await loadQuote(symbol);
  if (result.status === 'rate-limited') {
    return <QuoteUnavailable symbol={symbol} reason="rate-limited" retryAt={result.retryAt} />;
  }
  if (result.status === 'error') return <QuoteUnavailable symbol={symbol} reason="error" />;
  return <StockDetail initialQuote={result.quote} />;
}
