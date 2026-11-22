import { systemClock, type Clock } from './clock.js';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export interface CreditBudgetOptions {
  perMinute: number;
  perDay: number;
  now?: Clock;
}

/** Credits granted by one reserve() call. */
export interface CreditReservation {
  readonly granted: number;
  /**
   * Gives back credits the provider did not charge (it rejected the call without serving data).
   * Defaults to everything not yet refunded; never more than was granted. A refund only restores
   * the windows the credits were taken from, so a late refund cannot inflate a new minute.
   */
  refund(count?: number): void;
}

/**
 * Twelve Data credits spent by this process (spec 02 §5), checked before every provider call.
 * Fixed windows aligned to the wall clock: the minute window resets at :00 and the daily
 * counter at 00:00 UTC, which is when the provider resets its daily cap.
 */
export interface CreditBudget {
  /** Reserves up to `requested` credits; `granted` goes from 0 to requested. */
  reserve(requested: number): CreditReservation;
  /** After a real 429 from the provider: no more credits until the next minute window. */
  markMinuteExhausted(): void;
  /** Seconds until credits are available again: next minute, or next UTC day if the day is spent. */
  retryAfterSeconds(): number;
}

export function createCreditBudget(options: CreditBudgetOptions): CreditBudget {
  const { perMinute, perDay } = options;
  const now = options.now ?? systemClock;

  let minuteWindow = -1;
  let minuteUsed = 0;
  let exhaustedMinute = -1;
  let dayWindow = -1;
  let dayUsed = 0;

  /** Starts new windows lazily, on the first use after a boundary. */
  function roll(): number {
    const current = now();
    const currentMinute = Math.floor(current / MINUTE_MS);
    if (currentMinute !== minuteWindow) {
      minuteWindow = currentMinute;
      minuteUsed = 0;
    }
    const currentDay = Math.floor(current / DAY_MS);
    if (currentDay !== dayWindow) {
      dayWindow = currentDay;
      dayUsed = 0;
    }
    return current;
  }

  function available(): number {
    // A flag rather than minuteUsed = perMinute, so a refund cannot reopen an exhausted minute.
    if (exhaustedMinute === minuteWindow) return 0;
    return Math.max(0, Math.min(perMinute - minuteUsed, perDay - dayUsed));
  }

  return {
    reserve(requested) {
      roll();
      const granted = Math.max(0, Math.min(Math.floor(requested), available()));
      minuteUsed += granted;
      dayUsed += granted;

      const reservedMinute = minuteWindow;
      const reservedDay = dayWindow;
      let refunded = 0;
      return {
        granted,
        refund(count = granted - refunded) {
          const amount = Math.max(0, Math.min(Math.floor(count), granted - refunded));
          if (amount === 0) return;
          refunded += amount;
          roll();
          if (minuteWindow === reservedMinute) minuteUsed = Math.max(0, minuteUsed - amount);
          if (dayWindow === reservedDay) dayUsed = Math.max(0, dayUsed - amount);
        },
      };
    },

    markMinuteExhausted() {
      roll();
      // Covers a provider window that is not exactly aligned with ours.
      exhaustedMinute = minuteWindow;
    },

    retryAfterSeconds() {
      const current = roll();
      const nextWindowStart =
        dayUsed >= perDay ? (dayWindow + 1) * DAY_MS : (minuteWindow + 1) * MINUTE_MS;
      return Math.max(1, Math.ceil((nextWindowStart - current) / 1000));
    },
  };
}
