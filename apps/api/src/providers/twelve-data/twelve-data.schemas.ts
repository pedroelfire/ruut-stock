// Raw Twelve Data payloads. Only this folder knows these shapes; everything else sees the mapped
// types from twelve-data.types.ts. Unknown extra fields are ignored (z.object strips them).
// Optional fields use nullish(): the provider sends null as well as omitting them.
import { z } from 'zod';

/**
 * Twelve Data sends numbers as strings ("148.85001"). Empty strings are rejected, and the final
 * z.number() rejects NaN and Infinity, so "abc" or "" never become 0 or NaN.
 */
const numeric = z.union([z.number(), z.string().trim().min(1).transform(Number)]).pipe(z.number());

/** Missing, null or empty string → ''. */
const textOrEmpty = z
  .string()
  .nullish()
  .transform((value) => value ?? '');

/** Error body, sent with HTTP 200 as well as with error statuses. */
export const rawErrorSchema = z.object({
  status: z.literal('error'),
  code: z.number().int(),
  message: textOrEmpty,
});
export type RawError = z.infer<typeof rawErrorSchema>;

export const rawQuoteSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  exchange: z.string().min(1),
  currency: z.string().min(1),
  /** Opening time of the requested bar (1day by default), Unix seconds. */
  timestamp: z.number().int().positive(),
  /** Time of the last minute candle, Unix seconds. Closer to "price as of" than timestamp. */
  last_quote_at: z.number().int().positive().nullish(),
  open: numeric,
  high: numeric,
  low: numeric,
  close: numeric,
  volume: numeric.nullish(),
  previous_close: numeric,
  change: numeric,
  percent_change: numeric,
  is_market_open: z.boolean(),
  fifty_two_week: z.object({ low: numeric, high: numeric }),
});
export type RawQuote = z.infer<typeof rawQuoteSchema>;

/** The list is checked as a whole; each row is validated on its own (see the client). */
export const rawSymbolSearchSchema = z.object({
  data: z.array(z.unknown()),
});

export const rawSymbolSearchRowSchema = z.object({
  symbol: z.string().min(1),
  instrument_name: z.string().min(1),
  exchange: z.string().min(1),
  mic_code: textOrEmpty,
  instrument_type: z.string().min(1),
  // Synthetic instruments (crypto pairs) come with an empty country.
  country: textOrEmpty,
});
export type RawSymbolSearchRow = z.infer<typeof rawSymbolSearchRowSchema>;

/** "2026-11-20" for daily bars, "2026-11-20 14:30:00" for intraday bars (UTC with timezone=UTC). */
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/;

export const rawTimeSeriesSchema = z.object({
  meta: z.object({ symbol: z.string().min(1) }),
  values: z.array(z.unknown()),
});

export const rawTimeSeriesValueSchema = z.object({
  datetime: z.string().regex(DATETIME_PATTERN),
  close: numeric,
});
export type RawTimeSeriesValue = z.infer<typeof rawTimeSeriesValueSchema>;
