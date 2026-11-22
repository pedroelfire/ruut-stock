import type { PartialMeta, Quote, QuoteResponse } from '@ruut/shared';
import { AppError, notFound, rateLimited } from '../../lib/errors.js';
import { MARKET_LIMIT_MESSAGE, UPSTREAM_MESSAGE, type QuoteBatchResult } from './market.service.js';

export function partialMeta(result: QuoteBatchResult): PartialMeta | undefined {
  return result.creditsShort ? { partial: true, retryAfter: result.retryAfter } : undefined;
}

/**
 * Case table of GET /market/quote (spec 02 §4):
 * - Any symbol with data (fresh or stale) → 200 with those quotes; unknown symbols are omitted
 *   and `meta.partial` is added when credits fell short for some symbol.
 * - No data at all → 429 if credits fell short for any symbol (it wins over "not found", so a
 *   budget problem never looks like a missing symbol), 502 if the provider failed, else 404.
 */
export function toQuoteResponse(
  symbols: readonly string[],
  result: QuoteBatchResult,
): QuoteResponse {
  const quotes: Quote[] = [];
  const statuses = new Set<string>();
  for (const symbol of symbols) {
    const lookup = result.lookups.get(symbol);
    statuses.add(lookup?.status ?? 'error');
    if (lookup?.status === 'ok') quotes.push(lookup.quote);
  }

  if (quotes.length > 0) {
    const meta = partialMeta(result);
    return meta ? { data: quotes, meta } : { data: quotes };
  }
  if (statuses.has('rate_limited')) throw rateLimited(result.retryAfter, MARKET_LIMIT_MESSAGE);
  if (statuses.has('error')) throw new AppError('UPSTREAM_ERROR', UPSTREAM_MESSAGE);
  throw notFound(symbols.length === 1 ? 'Symbol not found' : 'None of these symbols were found');
}
