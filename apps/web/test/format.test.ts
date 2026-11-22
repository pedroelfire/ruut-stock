import { describe, expect, it } from 'vitest';
import {
  changeDirection,
  formatAsOf,
  formatAxisDate,
  formatAxisTick,
  formatChange,
  formatMarketTime,
  formatPercent,
  formatPrice,
  formatTooltipDate,
  formatVolume,
} from '@/lib/format';

const MINUS = '−';

describe('formatPrice', () => {
  it('formats in the symbol currency with two decimals', () => {
    expect(formatPrice(189.8412)).toBe('$189.84');
    expect(formatPrice(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatPrice(10, 'EUR')).toBe('€10.00');
  });

  it('uses U+2212 for negative values', () => {
    expect(formatPrice(-3.5)).toBe(`${MINUS}$3.50`);
  });

  it('falls back to the code when Intl does not know the currency', () => {
    expect(formatPrice(12, 'NOT-A-CODE')).toBe('12.00 NOT-A-CODE');
  });
});

describe('formatChange and formatPercent', () => {
  it('adds a plus sign to positive values', () => {
    expect(formatChange(2.3149)).toBe('+2.31');
    expect(formatPercent(1.234)).toBe('+1.23%');
  });

  it('uses U+2212, never a hyphen, for negative values', () => {
    expect(formatChange(-6.64999)).toBe(`${MINUS}6.65`);
    expect(formatPercent(-0.73)).toBe(`${MINUS}0.73%`);
    expect(formatChange(-1)).not.toContain('-');
  });

  it('shows zero without a sign, including values that round to zero', () => {
    expect(formatChange(0)).toBe('0.00');
    expect(formatChange(-0.004)).toBe('0.00');
    expect(formatPercent(0.001)).toBe('0.00%');
    expect(formatPercent(-0)).toBe('0.00%');
  });

  it('derives the direction from the displayed value', () => {
    expect(changeDirection(0.006)).toBe('up');
    expect(changeDirection(-0.006)).toBe('down');
    expect(changeDirection(-0.004)).toBe('flat');
    expect(changeDirection(0)).toBe('flat');
  });
});

describe('formatVolume', () => {
  it('uses compact notation', () => {
    expect(formatVolume(52_312_000)).toBe('52.3M');
    expect(formatVolume(1_234)).toBe('1.2K');
    expect(formatVolume(999)).toBe('999');
    expect(formatVolume(2_100_000_000)).toBe('2.1B');
  });

  it('shows a dash when the provider does not report volume', () => {
    expect(formatVolume(null)).toBe('—');
  });
});

describe('dates in market time', () => {
  it('reads intraday instants in New York time, across daylight saving changes', () => {
    // EDT (UTC−4) in July, EST (UTC−5) in November.
    expect(formatAxisDate('2026-07-01T18:30:00Z', '1D')).toBe('14:30');
    expect(formatAxisDate('2026-11-20T19:30:00Z', '1D')).toBe('14:30');
    expect(formatMarketTime('2026-11-20T20:59:00Z')).toBe('15:59 ET');
    expect(formatAsOf('2026-11-20T14:32:00Z')).toBe('As of 09:32 ET');
  });

  it('uses a 24-hour clock, never 24:00', () => {
    expect(formatMarketTime('2026-11-21T05:05:00Z')).toBe('00:05 ET');
  });

  it('formats the axis by range', () => {
    expect(formatAxisDate('2026-11-12T15:00:00Z', '1W')).toBe('Nov 12');
    expect(formatAxisDate('2026-11-12T00:00:00Z', '6M')).toBe('Nov 12');
    expect(formatAxisDate('2026-11-12T00:00:00Z', '1Y')).toBe('Nov ’26');
  });

  it('labels 1W ticks only at day boundaries, so dates never repeat', () => {
    // Three 30-min points of Nov 18: only the first one, the day boundary, gets a label.
    expect(formatAxisTick('2026-11-18T14:30:00Z', '1W', 'day')).toBe('Nov 18');
    expect(formatAxisTick('2026-11-18T15:00:00Z', '1W', 'time')).toBe('');
    expect(formatAxisTick('2026-11-18T15:30:00Z', '1W', 'time')).toBe('');
    // A month boundary is also a day boundary.
    expect(formatAxisTick('2026-12-01T14:30:00Z', '1W', 'month')).toBe('Dec 1');
  });

  it('labels 1Y ticks only at month boundaries', () => {
    expect(formatAxisTick('2026-11-02T00:00:00Z', '1Y', 'month')).toBe('Nov ’26');
    expect(formatAxisTick('2026-11-09T00:00:00Z', '1Y', 'day')).toBe('');
    expect(formatAxisTick('2027-01-04T00:00:00Z', '1Y', 'year')).toBe('Jan ’27');
  });

  it('labels every tick of 1D, 1M and 6M', () => {
    expect(formatAxisTick('2026-11-18T15:00:00Z', '1D', 'time')).toBe('10:00');
    expect(formatAxisTick('2026-11-18T14:30:00Z', '1D', 'day')).toBe('09:30');
    expect(formatAxisTick('2026-11-12T00:00:00Z', '1M', 'day')).toBe('Nov 12');
    expect(formatAxisTick('2026-11-02T00:00:00Z', '6M', 'month')).toBe('Nov 2');
  });

  it('keeps daily points (00:00Z) on their trading date instead of the previous day in ET', () => {
    expect(formatAxisDate('2026-11-12T00:00:00Z', '1M')).toBe('Nov 12');
    expect(formatAxisDate('2026-01-01T00:00:00Z', '1Y')).toBe('Jan ’26');
    expect(formatTooltipDate('2026-11-12T00:00:00Z', '1M')).toBe('Nov 12, 2026');
  });

  it('a 1W point late in the evening UTC still belongs to the same ET day', () => {
    // 01:00Z on Nov 13 is 20:00 ET on Nov 12.
    expect(formatAxisDate('2026-11-13T01:00:00Z', '1W')).toBe('Nov 12');
    expect(formatTooltipDate('2026-11-13T01:00:00Z', '1W')).toBe('Nov 12, 20:00 ET');
  });
});
