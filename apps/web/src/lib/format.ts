import type { SeriesRange } from '@ruut/shared';

/**
 * Every number and date shown in the UI goes through this module (docs/ui-ux-conventions.md §8,
 * spec 03 §7). Locale en-US; times in the market's time zone, whatever the browser's zone is.
 */
const LOCALE = 'en-US';
export const MARKET_TIME_ZONE = 'America/New_York';

/** U+2212: the typographic minus the conventions require instead of the hyphen-minus. */
export const MINUS_SIGN = '−';
/** Shown wherever a value is missing (null volume, unavailable quote). */
export const MISSING_VALUE = '—';

export type DateInput = Date | string | number;

const formatterCache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function numberFormat(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const cached = formatterCache.get(key);
  if (cached instanceof Intl.NumberFormat) return cached;
  const formatter = new Intl.NumberFormat(LOCALE, options);
  formatterCache.set(key, formatter);
  return formatter;
}

function dateFormat(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const cached = formatterCache.get(key);
  if (cached instanceof Intl.DateTimeFormat) return cached;
  const formatter = new Intl.DateTimeFormat(LOCALE, options);
  formatterCache.set(key, formatter);
  return formatter;
}

function withMinusSign(text: string): string {
  return text.replace(/-/g, MINUS_SIGN);
}

function toDate(input: DateInput): Date {
  return input instanceof Date ? input : new Date(input);
}

/** Rounds to cents so the sign, the color and the text always agree (−0.004 shows as 0.00). */
function roundToCents(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export type ChangeDirection = 'up' | 'down' | 'flat';

/** Direction of a change as it will be displayed (two decimals). */
export function changeDirection(value: number): ChangeDirection {
  const rounded = roundToCents(value);
  if (rounded > 0) return 'up';
  if (rounded < 0) return 'down';
  return 'flat';
}

/** `$189.84`. Falls back to `189.84 XYZ` if the provider sends a currency Intl does not know. */
export function formatPrice(value: number, currency = 'USD'): string {
  try {
    const formatter = numberFormat(`price:${currency}`, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return withMinusSign(formatter.format(value));
  } catch {
    return `${formatPlain(value)} ${currency}`;
  }
}

function formatPlain(value: number): string {
  const formatter = numberFormat('plain', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return withMinusSign(formatter.format(value));
}

function formatSigned(value: number): string {
  const formatter = numberFormat('signed', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  });
  return withMinusSign(formatter.format(roundToCents(value)));
}

/** Absolute change with sign: `+2.31`, `−3.48`, `0.00`. */
export function formatChange(value: number): string {
  return formatSigned(value);
}

/** Percent change (already in percent units, 1.23 = 1.23 %): `+1.23%`, `−0.73%`, `0.00%`. */
export function formatPercent(value: number): string {
  return `${formatSigned(value)}%`;
}

/** Compact volume: `52.3M`, `1.2K`; `—` when the provider does not report it. */
export function formatVolume(value: number | null): string {
  if (value === null) return MISSING_VALUE;
  const formatter = numberFormat('volume', { notation: 'compact', maximumFractionDigits: 1 });
  return formatter.format(value);
}

/**
 * Daily ranges carry the trading date at 00:00Z (spec 02 §4): reading it in New York time would
 * move every point to the previous day, so those dates are read in UTC. Intraday ranges carry real
 * instants and are shown in market time.
 */
function isDailyRange(range: SeriesRange): boolean {
  return range === '1M' || range === '6M' || range === '1Y';
}

function timeZoneFor(range: SeriesRange): string {
  return isDailyRange(range) ? 'UTC' : MARKET_TIME_ZONE;
}

function marketClock(date: Date): string {
  return dateFormat('clock', {
    timeZone: MARKET_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function monthDay(date: Date, timeZone: string): string {
  return dateFormat(`month-day:${timeZone}`, {
    timeZone,
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function monthShortYear(date: Date, timeZone: string): string {
  const parts = dateFormat(`month-year:${timeZone}`, {
    timeZone,
    month: 'short',
    year: '2-digit',
  }).formatToParts(date);
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  return `${month} ’${year}`;
}

/** Chart axis label: `14:30` (1D), `Nov 12` (1W to 6M), `Nov ’26` (1Y). */
export function formatAxisDate(input: DateInput, range: SeriesRange): string {
  const date = toDate(input);
  if (range === '1D') return marketClock(date);
  if (range === '1Y') return monthShortYear(date, timeZoneFor(range));
  return monthDay(date, timeZoneFor(range));
}

/**
 * What a chart tick marks, as the chart library reports it: the first point of a new year, month
 * or day, or a point within the same day. Kept independent of the library so it stays testable.
 */
export type AxisTickKind = 'year' | 'month' | 'day' | 'time';

/**
 * Label for one tick of the time axis. 1W (30-min points) and 1Y (daily points) have several ticks
 * per label unit, and `formatAxisDate` alone would repeat "Nov 18" or "Nov ’26" on each of them:
 * those ranges label only the ticks that start a new day (1W) or a new month (1Y) and leave the
 * rest blank. The intraday boundaries come from UTC, which matches the market day because the
 * regular session (09:30 to 16:00 ET) never crosses midnight UTC.
 */
export function formatAxisTick(input: DateInput, range: SeriesRange, kind: AxisTickKind): string {
  if (range === '1W' && kind === 'time') return '';
  if (range === '1Y' && (kind === 'day' || kind === 'time')) return '';
  return formatAxisDate(input, range);
}

/** Crosshair tooltip: `Nov 12, 14:30 ET` for intraday ranges, `Nov 12, 2026` for daily ones. */
export function formatTooltipDate(input: DateInput, range: SeriesRange): string {
  const date = toDate(input);
  if (!isDailyRange(range)) return `${monthDay(date, MARKET_TIME_ZONE)}, ${marketClock(date)} ET`;
  return dateFormat('full-date:UTC', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/** `14:32 ET`. */
export function formatMarketTime(input: DateInput): string {
  return `${marketClock(toDate(input))} ET`;
}

/** `As of 14:32 ET`. */
export function formatAsOf(input: DateInput): string {
  return `As of ${formatMarketTime(input)}`;
}
