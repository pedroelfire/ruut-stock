import { z } from 'zod';

/** Spec 02 §4: GET /market/quote accepts at most this many symbols per request. */
export const QUOTE_MAX_SYMBOLS = 8;
export const SEARCH_QUERY_MAX_LENGTH = 32;
export const SEARCH_MAX_RESULTS = 8;

/**
 * US tickers: letters and digits, optionally with a class suffix after "." or "-" (BRK.B, BF-B).
 * Commas and slashes are rejected, so a symbol can never smuggle extra symbols into a batch.
 */
const SYMBOL_PATTERN = /^[A-Z0-9]{1,10}([.-][A-Z0-9]{1,4})?$/;

/** Trims and uppercases before validating, so " aapl " and "AAPL" are the same symbol. */
export const symbolSchema = z
  .string({ error: 'Symbol is required' })
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(SYMBOL_PATTERN, { error: 'Enter a valid ticker symbol' }));
export type StockSymbol = z.infer<typeof symbolSchema>;

/** `meta` of a successful response when the credit budget did not cover every requested item. */
export const partialMetaSchema = z.object({
  partial: z.literal(true),
  /** Seconds until the next credit window. */
  retryAfter: z.number().int().nonnegative(),
});
export type PartialMeta = z.infer<typeof partialMetaSchema>;

// ---------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------

export const searchQuerySchema = z.object({
  q: z
    .string({ error: 'Search query is required' })
    .trim()
    .min(1, { error: 'Search query is required' })
    .max(SEARCH_QUERY_MAX_LENGTH, {
      error: `Search query must be at most ${SEARCH_QUERY_MAX_LENGTH} characters`,
    }),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchResultSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  exchange: z.string(),
  /** `Common Stock` or `ETF`. */
  type: z.string(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

/** Response of GET /market/search. */
export const searchResponseSchema = z.object({
  data: z.array(searchResultSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------------------------

/** "AAPL,msft, AAPL" → ["AAPL", "MSFT"]: trimmed, uppercased, deduplicated, 1 to 8 symbols. */
export const quoteSymbolsSchema = z
  .string({ error: 'At least one symbol is required' })
  .transform((value) => value.split(',').map((symbol) => symbol.trim()))
  .pipe(z.array(symbolSchema))
  .transform((symbols) => [...new Set(symbols)])
  .pipe(
    z
      .array(z.string())
      .min(1, { error: 'At least one symbol is required' })
      .max(QUOTE_MAX_SYMBOLS, { error: `At most ${QUOTE_MAX_SYMBOLS} symbols per request` }),
  );

export const quoteQuerySchema = z.object({
  symbols: quoteSymbolsSchema,
});
export type QuoteQuery = z.infer<typeof quoteQuerySchema>;

export const quoteSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  exchange: z.string(),
  currency: z.string(),
  price: z.number(),
  change: z.number(),
  changePercent: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  previousClose: z.number(),
  /** null when the provider does not report volume for the instrument. */
  volume: z.number().nullable(),
  fiftyTwoWeek: z.object({ low: z.number(), high: z.number() }),
  isMarketOpen: z.boolean(),
  /** ISO 8601 time of the last price (provider's last_quote_at, falling back to timestamp). */
  asOf: z.iso.datetime(),
  /** true when served from an expired cache entry because a refresh was not possible. */
  stale: z.boolean(),
  /** Delay of the provider's data in minutes (0 = real time). */
  delayMinutes: z.number().int().nonnegative(),
});
export type Quote = z.infer<typeof quoteSchema>;

/** Response of GET /market/quote. */
export const quoteResponseSchema = z.object({
  data: z.array(quoteSchema),
  meta: partialMetaSchema.optional(),
});
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------------------------

export const SERIES_RANGES = ['1D', '1W', '1M', '6M', '1Y'] as const;
export const DEFAULT_SERIES_RANGE = '1M';

export const seriesRangeSchema = z.enum(SERIES_RANGES, {
  error: `Range must be one of ${SERIES_RANGES.join(', ')}`,
});
export type SeriesRange = z.infer<typeof seriesRangeSchema>;

export const seriesParamsSchema = z.object({
  symbol: symbolSchema,
});
export type SeriesParams = z.infer<typeof seriesParamsSchema>;

export const seriesQuerySchema = z.object({
  range: seriesRangeSchema.default(DEFAULT_SERIES_RANGE),
});
export type SeriesQuery = z.infer<typeof seriesQuerySchema>;

export const seriesPointSchema = z.object({
  /** ISO 8601 in UTC. Daily ranges use the trading date at 00:00Z. */
  t: z.iso.datetime(),
  close: z.number(),
});
export type SeriesPoint = z.infer<typeof seriesPointSchema>;

export const seriesSchema = z.object({
  symbol: z.string(),
  range: seriesRangeSchema,
  /** Ascending by time. */
  points: z.array(seriesPointSchema),
  /** Last close minus first close of the period (0 when there are fewer than two points). */
  periodChange: z.number(),
  periodChangePercent: z.number(),
  /** ISO 8601 time when the series was fetched from the provider. */
  asOf: z.iso.datetime(),
  stale: z.boolean(),
});
export type Series = z.infer<typeof seriesSchema>;

/** Response of GET /market/series/:symbol. */
export const seriesResponseSchema = z.object({
  data: seriesSchema,
});
export type SeriesResponse = z.infer<typeof seriesResponseSchema>;
