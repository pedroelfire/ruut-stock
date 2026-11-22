import { z } from 'zod';
import { partialMetaSchema, quoteSchema, symbolSchema } from './market.js';

/** Spec 02 §4: a watchlist holds at most this many symbols. */
export const WATCHLIST_MAX_SYMBOLS = 8;

export const addWatchlistItemBodySchema = z.object({
  symbol: symbolSchema,
});
export type AddWatchlistItemBody = z.infer<typeof addWatchlistItemBodySchema>;

export const watchlistSymbolParamsSchema = z.object({
  symbol: symbolSchema,
});
export type WatchlistSymbolParams = z.infer<typeof watchlistSymbolParamsSchema>;

/** A stored watchlist entry, without market data. Response item of POST /watchlist. */
export const watchlistEntrySchema = z.object({
  symbol: z.string(),
  /** Stored on insert, so it is always available even without a quote. */
  name: z.string(),
  addedAt: z.iso.datetime(),
});
export type WatchlistEntry = z.infer<typeof watchlistEntrySchema>;

export const watchlistItemSchema = watchlistEntrySchema.extend({
  /** null when no quote is available, neither fresh nor cached. */
  quote: quoteSchema.nullable(),
});
export type WatchlistItem = z.infer<typeof watchlistItemSchema>;

/** Response of GET /watchlist, ordered by addedAt ascending. */
export const watchlistResponseSchema = z.object({
  data: z.array(watchlistItemSchema),
  meta: partialMetaSchema.optional(),
});
export type WatchlistResponse = z.infer<typeof watchlistResponseSchema>;

/** Response of POST /watchlist (201). */
export const addWatchlistItemResponseSchema = z.object({
  data: watchlistEntrySchema,
});
export type AddWatchlistItemResponse = z.infer<typeof addWatchlistItemResponseSchema>;
