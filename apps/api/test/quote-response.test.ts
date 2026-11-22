import { describe, expect, it } from 'vitest';
import { AppError } from '../src/lib/errors.js';
import type { QuoteLookup } from '../src/modules/market/market.service.js';
import { toQuoteResponse } from '../src/modules/market/quote-response.js';
import { makeQuote } from './helpers.js';

type Status = QuoteLookup['status'];

function lookup(symbol: string, status: Status): QuoteLookup {
  if (status !== 'ok') return { status };
  return { status, quote: { ...makeQuote(symbol), stale: false, delayMinutes: 0 } };
}

/** Builds a batch result from one status per symbol (S1, S2...). */
function respond(statuses: Status[], creditsShort = statuses.includes('rate_limited')) {
  const entries = statuses.map((status, index): [string, QuoteLookup] => {
    const symbol = `S${index + 1}`;
    return [symbol, lookup(symbol, status)];
  });
  const symbols = entries.map(([symbol]) => symbol);
  const lookups = new Map(entries);
  return () => toQuoteResponse(symbols, { lookups, creditsShort, retryAfter: 30 });
}

function errorCodeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) return `${error.status} ${error.code}`;
    throw error;
  }
  return '200';
}

describe('toQuoteResponse (spec 02 §4 case table)', () => {
  it.each<[string, Status[], string]>([
    ['all ok', ['ok', 'ok'], '200'],
    ['ok + unknown', ['ok', 'not_found'], '200'],
    ['ok + provider error', ['ok', 'error'], '200'],
    ['all unknown', ['not_found', 'not_found'], '404 NOT_FOUND'],
    ['no credits only', ['rate_limited'], '429 RATE_LIMITED'],
    ['unknown + no credits', ['not_found', 'rate_limited'], '429 RATE_LIMITED'],
    ['provider error + no credits', ['error', 'rate_limited'], '429 RATE_LIMITED'],
    ['provider error only', ['error'], '502 UPSTREAM_ERROR'],
    ['unknown + provider error (502 wins over 404)', ['not_found', 'error'], '502 UPSTREAM_ERROR'],
  ])('%s → %s', (_case, statuses, expected) => {
    expect(errorCodeOf(respond(statuses))).toBe(expected);
  });

  it('returns only the symbols with data, in request order, and adds meta when credits ran short', () => {
    const response = respond(['not_found', 'ok', 'rate_limited', 'ok'])();

    expect(response.data.map((quote) => quote.symbol)).toEqual(['S2', 'S4']);
    expect(response.meta).toEqual({ partial: true, retryAfter: 30 });
  });

  it('adds meta even when every symbol has data, if some of it is stale for lack of credits', () => {
    const response = respond(['ok', 'ok'], true)();

    expect(response.meta).toEqual({ partial: true, retryAfter: 30 });
  });

  it('carries retryAfter on the 429', () => {
    try {
      respond(['rate_limited'])();
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: 'RATE_LIMITED', retryAfter: 30 });
    }
  });
});
