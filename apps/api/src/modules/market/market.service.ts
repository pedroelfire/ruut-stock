import {
  SEARCH_MAX_RESULTS,
  type Quote,
  type SearchResult,
  type Series,
  type SeriesRange,
} from '@ruut/shared';
import {
  cacheKey,
  inFlightKey,
  type CacheKey,
  type InFlightKey,
  type TtlCache,
} from '../../lib/cache.js';
import { systemClock, type Clock } from '../../lib/clock.js';
import type { CreditBudget, CreditReservation } from '../../lib/credit-budget.js';
import { AppError, notFound, rateLimited } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import {
  ProviderError,
  ProviderNotFoundError,
  ProviderRateLimitError,
  type MarketDataProvider,
  type ProviderQuote,
  type SymbolMatch,
} from '../../providers/twelve-data/index.js';
import { seriesRangeConfig } from './series-range.js';

const MINUTE_MS = 60_000;

/** Spec 02 §5. */
export const CACHE_TTL_MS = {
  search: 24 * 60 * MINUTE_MS,
  quoteMarketOpen: 2 * MINUTE_MS,
  quoteMarketClosed: 15 * MINUTE_MS,
  /** Negative cache: an unknown symbol does not cost a credit on every visit. */
  notFound: 15 * MINUTE_MS,
} as const;

/**
 * After a provider-wide failure (invalid key, provider down or unreachable), no request goes out
 * for this long: an outage should not turn every user request into another failing call.
 */
export const PROVIDER_COOLDOWN_MS = 30_000;

const SEARCHABLE_COUNTRY = 'United States';
const SEARCHABLE_TYPES = new Set(['Common Stock', 'ETF']);
/**
 * Spec 02 §4: main US listing venues, matched by name or by MIC. OTC is left out (illiquid,
 * often foreign shells), and so is IEX: it is a trading venue that repeats the primary listings.
 */
const SEARCHABLE_EXCHANGES = new Set([
  'NASDAQ',
  'NYSE',
  'NYSE ARCA',
  'NYSEARCA',
  'NYSE AMERICAN',
  'AMEX',
  'CBOE',
  'BATS',
]);
const SEARCHABLE_MICS = new Set([
  'XNAS',
  'XNGS',
  'XNMS',
  'XNCM',
  'XNYS',
  'ARCX',
  'XASE',
  'BATS',
  'BATY',
  'EDGA',
  'EDGX',
]);

export const MARKET_LIMIT_MESSAGE = 'Market data limit reached. Try again shortly.';
export const UPSTREAM_MESSAGE = 'Market data is temporarily unavailable. Try again later.';

/** Result of looking up one symbol of a quote batch. */
export type QuoteLookup =
  | { status: 'ok'; quote: Quote }
  | { status: 'not_found' }
  | { status: 'rate_limited' }
  | { status: 'error' };

export interface QuoteBatchResult {
  /** One entry per requested symbol. */
  lookups: Map<string, QuoteLookup>;
  /** true when some symbols could not be refreshed for lack of credits (served stale or missing). */
  creditsShort: boolean;
  /** Seconds until the next credit window. */
  retryAfter: number;
}

export interface MarketService {
  search(query: string): Promise<SearchResult[]>;
  /** Never throws for provider problems: each symbol reports its own outcome. */
  getQuotes(symbols: readonly string[]): Promise<QuoteBatchResult>;
  getSeries(symbol: string, range: SeriesRange): Promise<Series>;
}

export interface MarketServiceDeps {
  provider: MarketDataProvider;
  cache: TtlCache;
  budget: CreditBudget;
  logger: Logger;
  delayMinutes: number;
  /** Drives the provider cooldown. Defaults to the system clock. */
  now?: Clock;
}

/** What one provider refresh of a quote produced. Shared by deduped callers. */
type QuoteRefresh =
  | { kind: 'fetched'; quote: ProviderQuote }
  | { kind: 'not_found' }
  | { kind: 'rate_limited' }
  | { kind: 'error' };

type CachedSeries = Omit<Series, 'asOf' | 'stale'>;

/** The provider cooldown is active, so the call was not attempted (answered as 502 or stale). */
class ProviderCoolingDownError extends ProviderError {
  constructor() {
    super('Twelve Data skipped during cooldown after a provider-wide failure');
    this.name = 'ProviderCoolingDownError';
  }
}

/** The local budget refused the call before reaching the provider. */
class CreditsExhaustedError extends Error {
  constructor() {
    super('Local Twelve Data credit budget exhausted');
    this.name = 'CreditsExhaustedError';
  }
}

const quoteKey = (symbol: string): CacheKey<ProviderQuote> => cacheKey(`quote:${symbol}`);
const quoteRefreshKey = (symbol: string): InFlightKey<QuoteRefresh> =>
  inFlightKey(`refresh:quote:${symbol}`);
const missingQuoteKey = (symbol: string): CacheKey<true> => cacheKey(`missing:quote:${symbol}`);
const searchKey = (query: string): CacheKey<SearchResult[]> =>
  cacheKey(`search:${query.toLowerCase()}`);
const seriesKey = (symbol: string, range: SeriesRange): CacheKey<CachedSeries> =>
  cacheKey(`series:${symbol}:${range}`);
const missingSeriesKey = (symbol: string, range: SeriesRange): CacheKey<true> =>
  cacheKey(`missing:series:${symbol}:${range}`);

const quoteTtlMs = (quote: ProviderQuote): number =>
  quote.isMarketOpen ? CACHE_TTL_MS.quoteMarketOpen : CACHE_TTL_MS.quoteMarketClosed;

/** A missing symbol is a fact, not an outage: never hide it behind an old cached value. */
const isServableAsStale = (error: unknown): boolean => !(error instanceof ProviderNotFoundError);

const roundTo4 = (value: number): number => Math.round(value * 10_000) / 10_000;

const isMainUsListing = (match: SymbolMatch): boolean =>
  match.country === SEARCHABLE_COUNTRY &&
  SEARCHABLE_TYPES.has(match.type) &&
  (SEARCHABLE_EXCHANGES.has(match.exchange.toUpperCase()) ||
    SEARCHABLE_MICS.has(match.micCode.toUpperCase()));

/** 0: exact ticker, 1: ticker starts with the query, 2: anything else (e.g. a name match). */
function matchRank(symbol: string, query: string): number {
  if (symbol === query) return 0;
  return symbol.startsWith(query) ? 1 : 2;
}

/**
 * US common stocks and ETFs on main exchanges, one row per symbol (the provider lists each
 * venue; the first row is the most relevant). Exact ticker first, then prefix matches, then the
 * rest, keeping the provider's relevance order inside each group (Array#sort is stable).
 */
export function filterSearchResults(matches: SymbolMatch[], query: string): SearchResult[] {
  const normalizedQuery = query.trim().toUpperCase();
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const match of matches) {
    if (!isMainUsListing(match) || seen.has(match.symbol)) continue;
    seen.add(match.symbol);
    results.push({
      symbol: match.symbol,
      name: match.name,
      exchange: match.exchange,
      type: match.type,
    });
  }
  return results
    .sort((a, b) => matchRank(a.symbol, normalizedQuery) - matchRank(b.symbol, normalizedQuery))
    .slice(0, SEARCH_MAX_RESULTS);
}

export function periodChange(
  points: Series['points'],
): Pick<Series, 'periodChange' | 'periodChangePercent'> {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 2) return { periodChange: 0, periodChangePercent: 0 };
  const change = last.close - first.close;
  const percent = first.close === 0 ? 0 : (change / first.close) * 100;
  return { periodChange: roundTo4(change), periodChangePercent: roundTo4(percent) };
}

export function createMarketService(deps: MarketServiceDeps): MarketService {
  const { provider, cache, budget, logger, delayMinutes } = deps;
  const now = deps.now ?? systemClock;
  let cooldownUntil = 0;

  const isCoolingDown = (): boolean => now() < cooldownUntil;

  function logProviderError(operation: string, error: unknown): void {
    if (!(error instanceof ProviderError)) return;
    // Provider messages never contain the key: the client keeps the URL out of its errors.
    const details = { operation, error: error.name, reason: error.message };
    // An unknown symbol is normal user input, not a provider problem.
    if (error instanceof ProviderNotFoundError) logger.debug(details, 'Symbol not found');
    else logger.warn(details, 'Twelve Data call failed');
  }

  /**
   * Returns uncharged credits and learns from a real 429. On a 429 the refund only restores the
   * daily count: the minute stays closed until the next window.
   */
  function settleFailedCall(reservation: CreditReservation, error: unknown, count?: number): void {
    if (!(error instanceof ProviderError)) return;
    if (error.refundable) reservation.refund(count);
    if (error instanceof ProviderRateLimitError) budget.markMinuteExhausted();
    if (error.affectsAllRequests) cooldownUntil = now() + PROVIDER_COOLDOWN_MS;
  }

  /** Single-credit calls (search, series): reserve first, settle the credit if the call fails. */
  async function callWithOneCredit<T>(operation: string, call: () => Promise<T>): Promise<T> {
    // Checked before reserving, so the cooldown spends no credit. getOrLoad then serves stale.
    if (isCoolingDown()) throw new ProviderCoolingDownError();
    const reservation = budget.reserve(1);
    if (reservation.granted === 0) throw new CreditsExhaustedError();
    try {
      return await call();
    } catch (error) {
      settleFailedCall(reservation, error);
      logProviderError(operation, error);
      throw error;
    }
  }

  /** Fixed, client-safe messages: provider details stay in the logs. */
  function toAppError(error: unknown): unknown {
    if (error instanceof CreditsExhaustedError || error instanceof ProviderRateLimitError) {
      return rateLimited(budget.retryAfterSeconds(), MARKET_LIMIT_MESSAGE);
    }
    if (error instanceof ProviderNotFoundError) return notFound('Symbol not found');
    if (error instanceof ProviderError) return new AppError('UPSTREAM_ERROR', UPSTREAM_MESSAGE);
    return error;
  }

  const isKnownMissing = (key: CacheKey<true>): boolean => {
    const hit = cache.peek(key);
    return hit !== undefined && !hit.stale;
  };
  const rememberMissing = (key: CacheKey<true>): void =>
    cache.set(key, true, CACHE_TTL_MS.notFound);

  /** One provider request for every symbol; never rejects, failures become refresh outcomes. */
  async function refreshQuotes(
    symbols: string[],
    reservation: CreditReservation,
  ): Promise<Map<string, QuoteRefresh>> {
    const everySymbol = (refresh: QuoteRefresh) => new Map(symbols.map((s) => [s, refresh]));
    let outcomes;
    try {
      outcomes = await provider.getQuotes(symbols);
    } catch (error) {
      settleFailedCall(reservation, error);
      logProviderError('quote', error);
      if (error instanceof ProviderRateLimitError) return everySymbol({ kind: 'rate_limited' });
      if (error instanceof ProviderError) return everySymbol({ kind: 'error' });
      throw error;
    }

    const refreshes = new Map<string, QuoteRefresh>();
    for (const symbol of symbols) {
      const outcome = outcomes.get(symbol) ?? {
        ok: false as const,
        error: new ProviderError('Symbol missing from provider result', { refundable: false }),
      };
      if (outcome.ok) {
        cache.set(quoteKey(symbol), outcome.quote, quoteTtlMs(outcome.quote));
        refreshes.set(symbol, { kind: 'fetched', quote: outcome.quote });
        continue;
      }
      settleFailedCall(reservation, outcome.error, 1);
      logProviderError('quote', outcome.error);
      if (outcome.error instanceof ProviderNotFoundError) {
        rememberMissing(missingQuoteKey(symbol));
        refreshes.set(symbol, { kind: 'not_found' });
      } else if (outcome.error instanceof ProviderRateLimitError) {
        refreshes.set(symbol, { kind: 'rate_limited' });
      } else {
        refreshes.set(symbol, { kind: 'error' });
      }
    }
    return refreshes;
  }

  const withFreshness = (quote: ProviderQuote, stale: boolean): Quote => ({
    ...quote,
    stale,
    delayMinutes,
  });

  /** Falls back to the expired cache entry, if any, when a refresh produced no quote. */
  function staleOr(symbol: string, otherwise: QuoteLookup): QuoteLookup {
    const cached = cache.peek(quoteKey(symbol));
    return cached ? { status: 'ok', quote: withFreshness(cached.value, true) } : otherwise;
  }

  return {
    async search(query) {
      try {
        const hit = await cache.getOrLoad(searchKey(query), {
          ttlMs: () => CACHE_TTL_MS.search,
          serveStaleOn: isServableAsStale,
          load: () =>
            callWithOneCredit('search', async () =>
              filterSearchResults(await provider.searchSymbols(query), query),
            ),
        });
        return hit.value;
      } catch (error) {
        // The provider answers 400 to some odd queries. For a search that means "no match",
        // but the empty list is not cached: it comes from an error, not from real results.
        if (error instanceof ProviderNotFoundError) return [];
        throw toAppError(error);
      }
    },

    async getQuotes(symbols) {
      const refreshes = new Map<string, Promise<QuoteRefresh>>();
      const fresh = new Map<string, ProviderQuote>();
      const knownMissing = new Set<string>();
      const toFetch: string[] = [];

      for (const symbol of symbols) {
        const cached = cache.peek(quoteKey(symbol));
        const running = cache.pending(quoteRefreshKey(symbol));
        if (isKnownMissing(missingQuoteKey(symbol))) knownMissing.add(symbol);
        else if (cached && !cached.stale) fresh.set(symbol, cached.value);
        else if (running) refreshes.set(symbol, running);
        else toFetch.push(symbol);
      }

      // During the provider cooldown nothing new goes out: stale data or an upstream error.
      if (isCoolingDown()) {
        for (const symbol of toFetch.splice(0)) {
          refreshes.set(symbol, Promise.resolve<QuoteRefresh>({ kind: 'error' }));
        }
      }

      // Partial reservation: only the symbols that fit in the budget go to the provider.
      const reservation = budget.reserve(toFetch.length);
      const fetchNow = toFetch.slice(0, reservation.granted);
      const withoutCredits = new Set(toFetch.slice(reservation.granted));

      if (fetchNow.length > 0) {
        const batch = refreshQuotes(fetchNow, reservation);
        for (const symbol of fetchNow) {
          const refresh = cache.dedupe(quoteRefreshKey(symbol), async () => {
            const result = (await batch).get(symbol);
            return result ?? { kind: 'error' as const };
          });
          refreshes.set(symbol, refresh);
        }
      }

      // Promise.all attaches a handler to every refresh, so one failure cannot leave the others
      // as unhandled rejections (which would crash the process).
      const settled = new Map(
        await Promise.all(
          [...refreshes].map(async ([symbol, refresh]) => [symbol, await refresh] as const),
        ),
      );

      let creditsShort = withoutCredits.size > 0;
      const lookups = new Map<string, QuoteLookup>();
      for (const symbol of symbols) {
        const freshQuote = fresh.get(symbol);
        if (knownMissing.has(symbol)) {
          lookups.set(symbol, { status: 'not_found' });
          continue;
        }
        if (freshQuote) {
          lookups.set(symbol, { status: 'ok', quote: withFreshness(freshQuote, false) });
          continue;
        }
        if (withoutCredits.has(symbol)) {
          lookups.set(symbol, staleOr(symbol, { status: 'rate_limited' }));
          continue;
        }
        const refresh: QuoteRefresh = settled.get(symbol) ?? { kind: 'error' };
        switch (refresh.kind) {
          case 'fetched':
            lookups.set(symbol, { status: 'ok', quote: withFreshness(refresh.quote, false) });
            break;
          case 'not_found':
            lookups.set(symbol, { status: 'not_found' });
            break;
          case 'rate_limited':
            creditsShort = true;
            lookups.set(symbol, staleOr(symbol, { status: 'rate_limited' }));
            break;
          case 'error':
            lookups.set(symbol, staleOr(symbol, { status: 'error' }));
            break;
        }
      }

      return { lookups, creditsShort, retryAfter: budget.retryAfterSeconds() };
    },

    async getSeries(symbol, range) {
      if (isKnownMissing(missingSeriesKey(symbol, range))) throw notFound('Symbol not found');
      const config = seriesRangeConfig(range);
      try {
        const hit = await cache.getOrLoad(seriesKey(symbol, range), {
          ttlMs: () => config.cacheTtlMs,
          serveStaleOn: isServableAsStale,
          load: () =>
            callWithOneCredit('series', async (): Promise<CachedSeries> => {
              const series = await provider.getTimeSeries(symbol, {
                interval: config.interval,
                outputsize: config.outputsize,
              });
              return { symbol, range, points: series.points, ...periodChange(series.points) };
            }),
        });
        return { ...hit.value, asOf: new Date(hit.storedAt).toISOString(), stale: hit.stale };
      } catch (error) {
        if (error instanceof ProviderNotFoundError)
          rememberMissing(missingSeriesKey(symbol, range));
        throw toAppError(error);
      }
    },
  };
}
