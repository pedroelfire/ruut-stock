import { describe, expect, it, vi } from 'vitest';
import { cacheKey, TtlCache } from '../src/lib/cache.js';
import { ManualClock } from './helpers.js';

const MINUTE = 60_000;
const key = cacheKey<string>('quote:AAPL');

function setup() {
  const clock = new ManualClock();
  const cache = new TtlCache({ now: clock.now });
  return { clock, cache };
}

describe('TtlCache', () => {
  it('expires an entry after its TTL but keeps it, flagged as stale', () => {
    const { clock, cache } = setup();
    cache.set(key, 'v1', 2 * MINUTE);

    clock.advance(2 * MINUTE - 1);
    expect(cache.peek(key)).toMatchObject({ value: 'v1', stale: false });

    clock.advance(1);
    expect(cache.peek(key)).toMatchObject({ value: 'v1', stale: true });
  });

  it('decides the TTL from the loaded value (2 min with the market open, 15 min closed)', async () => {
    const { clock, cache } = setup();
    const ttlMs = (quote: { isMarketOpen: boolean }) => (quote.isMarketOpen ? 2 : 15) * MINUTE;
    const openKey = cacheKey<{ isMarketOpen: boolean }>('quote:OPEN');
    const closedKey = cacheKey<{ isMarketOpen: boolean }>('quote:CLOSED');

    await cache.getOrLoad(openKey, { load: async () => ({ isMarketOpen: true }), ttlMs });
    await cache.getOrLoad(closedKey, { load: async () => ({ isMarketOpen: false }), ttlMs });

    clock.advance(2 * MINUTE);
    expect(cache.peek(openKey)?.stale).toBe(true);
    expect(cache.peek(closedKey)?.stale).toBe(false);

    clock.advance(13 * MINUTE);
    expect(cache.peek(closedKey)?.stale).toBe(true);
  });

  it('serves a fresh entry without loading again', async () => {
    const { cache } = setup();
    const load = vi.fn(async () => 'v1');

    await cache.getOrLoad(key, { load, ttlMs: () => MINUTE });
    const second = await cache.getOrLoad(key, { load, ttlMs: () => MINUTE });

    expect(second).toMatchObject({ value: 'v1', stale: false });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reloads an expired entry', async () => {
    const { clock, cache } = setup();
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('v1')
      .mockResolvedValueOnce('v2');

    await cache.getOrLoad(key, { load, ttlMs: () => MINUTE });
    clock.advance(MINUTE);
    const reloaded = await cache.getOrLoad(key, { load, ttlMs: () => MINUTE });

    expect(reloaded).toMatchObject({ value: 'v2', stale: false });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares one load between concurrent requests for the same key', async () => {
    const { cache } = setup();
    let release: (value: string) => void = () => {};
    const load = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));

    const first = cache.getOrLoad(key, { load, ttlMs: () => MINUTE });
    const second = cache.getOrLoad(key, { load, ttlMs: () => MINUTE });
    release('v1');

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ value: 'v1' }),
      expect.objectContaining({ value: 'v1' }),
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('runs a new load once the previous one has settled (no stuck in-flight entry)', async () => {
    const { clock, cache } = setup();
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('v1');

    await expect(cache.getOrLoad(key, { load, ttlMs: () => MINUTE })).rejects.toThrow('boom');
    clock.advance(1);
    await expect(cache.getOrLoad(key, { load, ttlMs: () => MINUTE })).resolves.toMatchObject({
      value: 'v1',
    });
  });

  it('serves the expired entry with stale: true when the reload fails', async () => {
    const { clock, cache } = setup();
    cache.set(key, 'old', MINUTE);
    clock.advance(MINUTE);

    const hit = await cache.getOrLoad(key, {
      load: async () => {
        throw new Error('provider down');
      },
      ttlMs: () => MINUTE,
    });

    expect(hit).toEqual({ value: 'old', stale: true, storedAt: clock.current - MINUTE });
  });

  it('rethrows when the reload fails and there is nothing cached', async () => {
    const { cache } = setup();
    const failure = new Error('provider down');

    await expect(
      cache.getOrLoad(key, { load: () => Promise.reject(failure), ttlMs: () => MINUTE }),
    ).rejects.toBe(failure);
  });

  it('does not serve stale data for errors excluded by serveStaleOn', async () => {
    const { clock, cache } = setup();
    cache.set(key, 'old', MINUTE);
    clock.advance(MINUTE);
    const notFound = new Error('not found');

    await expect(
      cache.getOrLoad(key, {
        load: () => Promise.reject(notFound),
        ttlMs: () => MINUTE,
        serveStaleOn: (error) => error !== notFound,
      }),
    ).rejects.toBe(notFound);
  });

  it('evicts the least recently used entry beyond maxEntries', () => {
    const cache = new TtlCache({ maxEntries: 2 });
    const a = cacheKey<string>('a');
    const b = cacheKey<string>('b');
    const c = cacheKey<string>('c');
    cache.set(a, 'a', MINUTE);
    cache.set(b, 'b', MINUTE);
    cache.peek(a);
    cache.set(c, 'c', MINUTE);

    expect(cache.peek(a)?.value).toBe('a');
    expect(cache.peek(b)).toBeUndefined();
  });
});
