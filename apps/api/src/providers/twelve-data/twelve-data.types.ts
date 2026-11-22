import type { Quote, SeriesPoint } from '@ruut/shared';
import type { ProviderError } from './twelve-data.errors.js';

/** A quote as the provider knows it: freshness and delay are added by the market service. */
export type ProviderQuote = Omit<Quote, 'stale' | 'delayMinutes'>;

/** Each symbol of a batch succeeds or fails on its own. */
export type ProviderQuoteOutcome =
  { ok: true; quote: ProviderQuote } | { ok: false; error: ProviderError };

export interface SymbolMatch {
  symbol: string;
  name: string;
  exchange: string;
  /** ISO 10383 market identifier (XNGS, XNYS, ARCX...); empty when the provider omits it. */
  micCode: string;
  /** Provider instrument type, e.g. "Common Stock", "ETF", "Mutual Fund". */
  type: string;
  /** Empty for synthetic instruments. */
  country: string;
}

export interface ProviderSeries {
  symbol: string;
  /** Ascending by time, ISO 8601 in UTC. */
  points: SeriesPoint[];
}

export interface TimeSeriesParams {
  interval: '5min' | '30min' | '1day';
  outputsize: number;
}

/** The only door to Twelve Data. Tests replace it with a fake; the real one is in the client. */
export interface MarketDataProvider {
  searchSymbols(query: string): Promise<SymbolMatch[]>;
  /**
   * One request for every symbol (one credit each). Throws for whole-request failures
   * (429, timeout, invalid payload); per-symbol failures come back as outcomes.
   */
  getQuotes(symbols: readonly string[]): Promise<Map<string, ProviderQuoteOutcome>>;
  getTimeSeries(symbol: string, params: TimeSeriesParams): Promise<ProviderSeries>;
}
