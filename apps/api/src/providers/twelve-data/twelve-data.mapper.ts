import type { SeriesPoint } from '@ruut/shared';
import type { RawQuote, RawSymbolSearchRow, RawTimeSeriesValue } from './twelve-data.schemas.js';
import type { ProviderQuote, SymbolMatch } from './twelve-data.types.js';

const unixSecondsToIso = (seconds: number): string => new Date(seconds * 1000).toISOString();

export function mapQuote(raw: RawQuote): ProviderQuote {
  return {
    symbol: raw.symbol.toUpperCase(),
    name: raw.name,
    exchange: raw.exchange,
    currency: raw.currency,
    price: raw.close,
    change: raw.change,
    changePercent: raw.percent_change,
    open: raw.open,
    high: raw.high,
    low: raw.low,
    previousClose: raw.previous_close,
    volume: raw.volume ?? null,
    fiftyTwoWeek: { low: raw.fifty_two_week.low, high: raw.fifty_two_week.high },
    isMarketOpen: raw.is_market_open,
    // `timestamp` is the opening of the daily bar; last_quote_at is the last minute candle.
    asOf: unixSecondsToIso(raw.last_quote_at ?? raw.timestamp),
  };
}

export function mapSymbolSearchRow(row: RawSymbolSearchRow): SymbolMatch {
  return {
    symbol: row.symbol.toUpperCase(),
    name: row.instrument_name,
    exchange: row.exchange,
    micCode: row.mic_code,
    type: row.instrument_type,
    country: row.country,
  };
}

/**
 * Requests use timezone=UTC, so intraday datetimes are UTC without an offset. Daily bars only
 * carry the date (the provider ignores timezone for them), which becomes 00:00Z of that date.
 * Returns null for a datetime that matches the pattern but is not a real date (2026-13-45).
 */
export function providerDatetimeToIso(datetime: string): string | null {
  const [date, time = '00:00:00'] = datetime.split(' ');
  const withSeconds = time.length === 5 ? `${time}:00` : time;
  const parsed = new Date(`${date}T${withSeconds}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function mapTimeSeriesValue(value: RawTimeSeriesValue): SeriesPoint | null {
  const t = providerDatetimeToIso(value.datetime);
  return t === null ? null : { t, close: value.close };
}
