import { LRUCache } from 'lru-cache';
import { systemClock, type Clock } from './clock.js';

/** Spec 02 §5: the whole cache (search, quotes and series) holds at most this many entries. */
export const DEFAULT_MAX_ENTRIES = 500;

declare const cachedValueType: unique symbol;

/**
 * A string key that remembers the type of the value stored under it, so `peek(quoteKey(...))`
 * is typed without callers casting. Build keys with `cacheKey<T>()`.
 */
export type CacheKey<T> = string & { readonly [cachedValueType]?: T };

export function cacheKey<T>(key: string): CacheKey<T> {
  return key as CacheKey<T>;
}

declare const taskResultType: unique symbol;

/**
 * Key of a running task, typed by the task's result. In-flight tasks live in their own namespace,
 * separate from stored values, so a key can never mix a cached value with a task result.
 */
export type InFlightKey<R> = string & { readonly [taskResultType]?: R };

export function inFlightKey<R>(key: string): InFlightKey<R> {
  return key as InFlightKey<R>;
}

export interface CacheHit<T> {
  value: T;
  /** true once the entry is past its expiresAt. Expired entries are kept for stale-while-error. */
  stale: boolean;
  /** When the value was stored (ms since epoch). */
  storedAt: number;
}

interface CacheEntry {
  value: unknown;
  storedAt: number;
  expiresAt: number;
}

export interface GetOrLoadOptions<T> {
  load: () => Promise<T>;
  /** TTL decided per value, e.g. a quote lives longer while the market is closed. */
  ttlMs: (value: T) => number;
  /** Whether a failed load may fall back to an expired entry. Defaults to always. */
  serveStaleOn?: (error: unknown) => boolean;
}

export interface CacheOptions {
  maxEntries?: number;
  now?: Clock;
}

/**
 * LRU cache with a TTL per entry, in-flight dedupe and stale-while-error (spec 02 §5).
 * The LRU's own `ttl` option is deliberately not used: it deletes expired entries on read, and
 * then they could not be served as stale. Each entry carries its own expiresAt instead.
 */
export class TtlCache {
  private readonly store: LRUCache<string, CacheEntry>;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly now: Clock;

  constructor(options: CacheOptions = {}) {
    this.store = new LRUCache({ max: options.maxEntries ?? DEFAULT_MAX_ENTRIES });
    this.now = options.now ?? systemClock;
  }

  /** Returns the entry, fresh or expired, without loading anything. */
  peek<T>(key: CacheKey<T>): CacheHit<T> | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    return {
      // Safe: CacheKey<T> ties every key to the single type that set() stored under it.
      value: entry.value as T,
      stale: this.now() >= entry.expiresAt,
      storedAt: entry.storedAt,
    };
  }

  set<T>(key: CacheKey<T>, value: T, ttlMs: number): void {
    const storedAt = this.now();
    this.store.set(key, { value, storedAt, expiresAt: storedAt + ttlMs });
  }

  /** The promise of a task already running under this key, if any. */
  pending<R>(key: InFlightKey<R>): Promise<R> | undefined {
    // Safe: InFlightKey<R> ties every key to the single result type its tasks produce.
    return this.inFlight.get(key) as Promise<R> | undefined;
  }

  /** Concurrent callers with the same key share one execution of `task`. */
  dedupe<R>(key: InFlightKey<R>, task: () => Promise<R>): Promise<R> {
    const running = this.pending<R>(key);
    if (running) return running;
    const promise = task().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Fresh entry → returned as is. Otherwise loads once (deduped) and stores the result. If the
   * load fails and an expired entry exists, that entry is returned with stale: true.
   */
  async getOrLoad<T>(key: CacheKey<T>, options: GetOrLoadOptions<T>): Promise<CacheHit<T>> {
    const cached = this.peek(key);
    if (cached && !cached.stale) return cached;

    try {
      const loadKey = inFlightKey<CacheHit<T>>(`load:${key}`);
      return await this.dedupe(loadKey, async (): Promise<CacheHit<T>> => {
        const value = await options.load();
        this.set(key, value, options.ttlMs(value));
        return { value, stale: false, storedAt: this.now() };
      });
    } catch (error) {
      const serveStale = options.serveStaleOn?.(error) ?? true;
      // Re-read: the entry may have been refreshed by someone else while this load failed.
      const fallback = this.peek(key);
      if (serveStale && fallback) return fallback;
      throw error;
    }
  }
}
