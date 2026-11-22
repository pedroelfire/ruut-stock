import { describe, expect, it } from 'vitest';
import { createCreditBudget } from '../src/lib/credit-budget.js';
import { ManualClock } from './helpers.js';

const SECOND = 1000;

function setup(options: { perMinute?: number; perDay?: number; at?: number } = {}) {
  // 15:00:20 UTC: 40 seconds left in the current minute window.
  const clock = new ManualClock(options.at ?? Date.UTC(2026, 10, 20, 15, 0, 20));
  const budget = createCreditBudget({
    perMinute: options.perMinute ?? 8,
    perDay: options.perDay ?? 800,
    now: clock.now,
  });
  return { clock, budget };
}

describe('credit budget', () => {
  it('grants the whole request when it fits in the minute', () => {
    const { budget } = setup();

    expect(budget.reserve(5).granted).toBe(5);
    expect(budget.reserve(3).granted).toBe(3);
  });

  it('grants only what is left (partial reservation) and reports seconds to the next window', () => {
    const { budget } = setup();
    budget.reserve(5);

    expect(budget.reserve(5).granted).toBe(3);
    expect(budget.reserve(1).granted).toBe(0);
    expect(budget.retryAfterSeconds()).toBe(40);
  });

  it('starts a fresh minute window at the next wall-clock minute', () => {
    const { clock, budget } = setup();
    budget.reserve(8);

    clock.advance(40 * SECOND - 1);
    expect(budget.reserve(1).granted).toBe(0);
    clock.advance(1);
    expect(budget.reserve(8).granted).toBe(8);
  });

  it('treats a real provider 429 as an exhausted minute until the next window', () => {
    const { clock, budget } = setup();
    budget.reserve(2);

    budget.markMinuteExhausted();

    expect(budget.reserve(1).granted).toBe(0);
    expect(budget.retryAfterSeconds()).toBe(40);
    clock.advance(40 * SECOND);
    expect(budget.reserve(1).granted).toBe(1);
  });

  it('caps the day and points retryAfter to the next UTC midnight', () => {
    // 23:00:00 UTC with 3 credits a day.
    const { clock, budget } = setup({ perDay: 3, at: Date.UTC(2026, 10, 20, 23, 0, 0) });

    expect(budget.reserve(5).granted).toBe(3);
    clock.advance(30 * 60 * SECOND);
    expect(budget.reserve(1).granted).toBe(0);
    expect(budget.retryAfterSeconds()).toBe(30 * 60);

    clock.advance(30 * 60 * SECOND);
    expect(budget.reserve(1).granted).toBe(1);
  });

  it('never grants negative or fractional credits', () => {
    const { budget } = setup();

    expect(budget.reserve(0).granted).toBe(0);
    expect(budget.reserve(-3).granted).toBe(0);
    expect(budget.reserve(2.7).granted).toBe(2);
  });

  describe('refunds', () => {
    it('gives uncharged credits back to the minute and the day', () => {
      const { budget } = setup({ perMinute: 8, perDay: 8 });
      const reservation = budget.reserve(8);

      reservation.refund(3);

      expect(budget.reserve(8).granted).toBe(3);
    });

    it('never refunds more than was granted, even across several calls', () => {
      const { budget } = setup();
      const reservation = budget.reserve(2);
      budget.reserve(6);

      reservation.refund(5);
      reservation.refund();

      expect(budget.reserve(8).granted).toBe(2);
    });

    it('after a minute boundary only restores the day, never inflating the new minute', () => {
      const { clock, budget } = setup({ perMinute: 2, perDay: 3 });
      const reservation = budget.reserve(2);
      clock.advance(40 * SECOND);

      reservation.refund();

      // New minute: 2 per minute as usual; the day got its 2 credits back (3 left, not 1).
      expect(budget.reserve(5).granted).toBe(2);
      clock.advance(60 * SECOND);
      expect(budget.reserve(5).granted).toBe(1);
    });

    it('does not reopen a minute closed by a real 429', () => {
      const { budget } = setup();
      const reservation = budget.reserve(1);

      budget.markMinuteExhausted();
      reservation.refund();

      expect(budget.reserve(1).granted).toBe(0);
    });
  });
});
