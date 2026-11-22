import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { TtlCache } from '../src/lib/cache.js';
import { createCreditBudget } from '../src/lib/credit-budget.js';
import { createMarketService } from '../src/modules/market/market.service.js';
import { FakeMarketDataProvider, ManualClock } from './helpers.js';

/** The provider answers only when the test opens the gate, so both calls overlap for sure. */
function setupWithGate() {
  const clock = new ManualClock();
  const provider = new FakeMarketDataProvider(['AAPL', 'MSFT', 'NVDA']);
  let open: () => void = () => {};
  provider.quoteGate = new Promise((resolve) => (open = resolve));
  const service = createMarketService({
    provider,
    cache: new TtlCache({ now: clock.now }),
    budget: createCreditBudget({ perMinute: 8, perDay: 800, now: clock.now }),
    logger: pino({ level: 'silent' }),
    delayMinutes: 0,
  });
  return { service, provider, open };
}

describe('market service quote dedupe', () => {
  it('shares one provider call between overlapping requests for the same symbol', async () => {
    const { service, provider, open } = setupWithGate();

    // Both calls start before the provider answers: the second joins the first one's refresh.
    const first = service.getQuotes(['AAPL']);
    const second = service.getQuotes(['AAPL']);
    open();
    const results = await Promise.all([first, second]);

    expect(provider.quoteCalls).toEqual([['AAPL']]);
    for (const result of results) {
      expect(result.lookups.get('AAPL')).toMatchObject({
        status: 'ok',
        quote: { symbol: 'AAPL', stale: false },
      });
    }
  });

  it('across batches, only asks for the symbols that are not already in flight', async () => {
    const { service, provider, open } = setupWithGate();

    const first = service.getQuotes(['AAPL', 'MSFT']);
    const second = service.getQuotes(['AAPL', 'NVDA']);
    open();
    const [, secondResult] = await Promise.all([first, second]);

    expect(provider.quoteCalls).toEqual([['AAPL', 'MSFT'], ['NVDA']]);
    expect([...secondResult.lookups.values()].map((lookup) => lookup.status)).toEqual(['ok', 'ok']);
  });
});
