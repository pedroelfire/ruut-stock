import type { z } from 'zod';
import {
  ProviderError,
  ProviderNotFoundError,
  providerErrorFromCode,
  providerErrorFromStatus,
} from './twelve-data.errors.js';
import { mapQuote, mapSymbolSearchRow, mapTimeSeriesValue } from './twelve-data.mapper.js';
import {
  rawErrorSchema,
  rawQuoteSchema,
  rawSymbolSearchRowSchema,
  rawSymbolSearchSchema,
  rawTimeSeriesSchema,
  rawTimeSeriesValueSchema,
} from './twelve-data.schemas.js';
import type {
  MarketDataProvider,
  ProviderQuoteOutcome,
  ProviderSeries,
  SymbolMatch,
  TimeSeriesParams,
} from './twelve-data.types.js';

export const DEFAULT_TIMEOUT_MS = 8_000;
/** Spec 02 §4: fetch more than we show, because the search is filtered to US stocks and ETFs. */
const SEARCH_OUTPUT_SIZE = 30;
/** Enough issue paths to locate a schema change in the logs without flooding them. */
const MAX_ISSUE_PATHS = 5;

export interface TwelveDataClientOptions {
  apiKey: string;
  baseUrl: string;
  /** Injected so tests never touch the network. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface ProviderResponse {
  status: number;
  body: unknown;
}

/** Error body (`status: "error"` + numeric code), whatever the HTTP status was. */
function errorFromBody(body: unknown): ProviderError | null {
  const parsed = rawErrorSchema.safeParse(body);
  return parsed.success ? providerErrorFromCode(parsed.data.code, parsed.data.message) : null;
}

/**
 * Twelve Data may answer 200 with an error body, so the body wins when it has one. Without it,
 * only the HTTP status is left, and a bare 4xx is never read as "not found".
 */
function errorFromResponse({ status, body }: ProviderResponse): ProviderError | null {
  const bodyError = errorFromBody(body);
  if (bodyError) return bodyError;
  if (status < 200 || status >= 300) return providerErrorFromStatus(status);
  return null;
}

/**
 * A 2xx body we cannot use. The provider served it, so it was charged: never refundable, or a
 * schema change in production would refund and retry every request past the per-minute cap.
 */
const invalidPayload = (what: string, detail = ''): ProviderError =>
  new ProviderError(`Unexpected Twelve Data ${what} payload${detail}`, { refundable: false });

/** The message lists where validation failed (field paths only, never values). */
function parseOrThrow<T extends z.ZodType>(schema: T, body: unknown, what: string): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  const paths = parsed.error.issues
    .slice(0, MAX_ISSUE_PATHS)
    .map((issue) => issue.path.join('.') || '(root)');
  throw invalidPayload(what, ` (invalid: ${paths.join(', ')})`);
}

/**
 * Keeps the rows that validate and map, dropping the rest: one odd row should not hide every
 * other result. A non-empty list where no row survives is treated as an invalid payload.
 */
function mapValidRows<S extends z.ZodType, T>(
  rows: unknown[],
  schema: S,
  map: (row: z.infer<S>) => T | null,
  what: string,
): T[] {
  const mapped: T[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    const value = parsed.success ? map(parsed.data) : null;
    if (value !== null) mapped.push(value);
  }
  if (rows.length > 0 && mapped.length === 0) throw invalidPayload(what, ' (no valid rows)');
  return mapped;
}

function quoteOutcome(body: unknown): ProviderQuoteOutcome {
  const error = errorFromBody(body);
  if (error) return { ok: false, error };
  try {
    return { ok: true, quote: mapQuote(parseOrThrow(rawQuoteSchema, body, 'quote')) };
  } catch (caught) {
    if (caught instanceof ProviderError) return { ok: false, error: caught };
    // mapQuote only throws on an out-of-range timestamp.
    return { ok: false, error: invalidPayload('quote', ' (timestamp out of range)') };
  }
}

/** A batch answers `{ AAPL: {...}, MSFT: {...} }`; a single symbol answers the quote itself. */
function quoteBodiesBySymbol(symbols: readonly string[], body: unknown): Map<string, unknown> {
  const [onlySymbol] = symbols;
  if (symbols.length === 1 && onlySymbol) return new Map([[onlySymbol, body]]);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalidPayload('quote batch');
  }
  // Keys echo the requested symbols; uppercasing guards against any casing difference.
  return new Map(Object.entries(body).map(([key, value]) => [key.toUpperCase(), value]));
}

export function createTwelveDataClient(options: TwelveDataClientOptions): MarketDataProvider {
  const { apiKey, baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const fetchFn = options.fetch ?? fetch;

  async function request(path: string, params: Record<string, string>): Promise<ProviderResponse> {
    const url = new URL(path, baseUrl);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    // The key is only ever added to the outgoing URL: never logged, never put in an error.
    url.searchParams.set('apikey', apiKey);

    let response: Response;
    try {
      response = await fetchFn(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // After a timeout the provider may still have processed (and charged) the request.
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ProviderError('Twelve Data request timed out', { refundable: false });
      }
      throw new ProviderError('Twelve Data unreachable', {
        refundable: true,
        affectsAllRequests: true,
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const result = { status: response.status, body };
    const error = errorFromResponse(result);
    if (error) throw error;
    if (body === undefined) throw invalidPayload(path, ' (not JSON)');
    return result;
  }

  return {
    async searchSymbols(query): Promise<SymbolMatch[]> {
      const { body } = await request('/symbol_search', {
        symbol: query,
        outputsize: String(SEARCH_OUTPUT_SIZE),
      });
      const raw = parseOrThrow(rawSymbolSearchSchema, body, 'symbol search');
      return mapValidRows(raw.data, rawSymbolSearchRowSchema, mapSymbolSearchRow, 'symbol search');
    },

    async getQuotes(symbols) {
      let body: unknown;
      try {
        ({ body } = await request('/quote', { symbol: symbols.join(',') }));
      } catch (error) {
        if (error instanceof ProviderNotFoundError) {
          const [onlySymbol] = symbols;
          // With one symbol, a request-level "not found" is about that symbol. With several it
          // says nothing about any one of them, so it is a provider error for the whole batch.
          if (symbols.length === 1 && onlySymbol) {
            return new Map([[onlySymbol, { ok: false, error }]]);
          }
          // Assumed charged, like any "not found" (only 401, 403, 5xx and 429 are refunded).
          throw new ProviderError(`Twelve Data rejected the batch: ${error.message}`);
        }
        throw error;
      }

      const bodies = quoteBodiesBySymbol(symbols, body);
      return new Map(
        symbols.map((symbol): [string, ProviderQuoteOutcome] => {
          const symbolBody = bodies.get(symbol);
          if (symbolBody === undefined) {
            // The batch was served (and charged); a missing entry does not change that.
            const error = new ProviderError('Symbol missing from batch', { refundable: false });
            return [symbol, { ok: false, error }];
          }
          return [symbol, quoteOutcome(symbolBody)];
        }),
      );
    },

    async getTimeSeries(symbol, params: TimeSeriesParams): Promise<ProviderSeries> {
      const { body } = await request('/time_series', {
        symbol,
        interval: params.interval,
        outputsize: String(params.outputsize),
        // Without it, intraday datetimes come in exchange local time with no offset.
        timezone: 'UTC',
      });
      const raw = parseOrThrow(rawTimeSeriesSchema, body, 'time series');
      const points = mapValidRows(
        raw.values,
        rawTimeSeriesValueSchema,
        mapTimeSeriesValue,
        'time series',
      )
        // The provider answers newest first; ISO strings in UTC sort chronologically.
        .sort((a, b) => a.t.localeCompare(b.t));
      return { symbol: raw.meta.symbol.toUpperCase(), points };
    },
  };
}
