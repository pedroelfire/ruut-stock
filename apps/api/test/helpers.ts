import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import { createApp, type AppConfig, type MarketConfig } from '../src/app.js';
import type { Clock } from '../src/lib/clock.js';
import { signAccessToken } from '../src/lib/jwt.js';
import {
  DuplicateEmailError,
  type UserRecord,
  type UserRepository,
} from '../src/modules/auth/user.repository.js';
import {
  DuplicateSymbolError,
  WatchlistFullError,
  WatchlistOwnerNotFoundError,
  type NewWatchlistItem,
  type WatchlistRecord,
  type WatchlistRepository,
} from '../src/modules/watchlist/watchlist.repository.js';
import {
  ProviderNotFoundError,
  type ProviderError,
  type MarketDataProvider,
  type ProviderQuote,
  type ProviderQuoteOutcome,
  type ProviderSeries,
  type SymbolMatch,
  type TimeSeriesParams,
} from '../src/providers/twelve-data/index.js';

export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

export const testMarketConfig: MarketConfig = {
  creditsPerMinute: 8,
  creditsPerDay: 800,
  delayMinutes: 0,
};

export const testConfig: AppConfig = {
  corsOrigins: ['http://localhost:3000'],
  jwtSecret: TEST_JWT_SECRET,
  jwtExpiresInSeconds: 3600,
  market: testMarketConfig,
};

/** Mirrors the database: unique email, DuplicateEmailError on conflict. */
export class InMemoryUserRepository implements UserRepository {
  readonly users = new Map<string, UserRecord>();

  async findByEmail(email: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async create(input: { email: string; passwordHash: string }): Promise<UserRecord> {
    if (await this.findByEmail(input.email)) throw new DuplicateEmailError();
    const user: UserRecord = { id: randomUUID(), ...input };
    this.users.set(user.id, user);
    return user;
  }
}

/**
 * Mirrors the Prisma repository: unique (userId, symbol) and an atomic count + insert. Every
 * method yields to the event loop first, like a real query, so concurrent requests interleave.
 */
export class InMemoryWatchlistRepository implements WatchlistRepository {
  readonly items = new Map<string, WatchlistRecord[]>();
  /** Users that exist, for the owner check; empty means "every user exists". */
  readonly knownUsers = new Set<string>();
  private tick = 0;

  private async yieldToEventLoop(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
  }

  private itemsOf(userId: string): WatchlistRecord[] {
    return this.items.get(userId) ?? [];
  }

  seed(userId: string, symbols: { symbol: string; name: string }[]): void {
    this.items.set(
      userId,
      symbols.map((item) => ({
        ...item,
        exchange: 'NASDAQ',
        addedAt: new Date(Date.UTC(2026, 0, 1) + (this.tick += 1) * 1000),
      })),
    );
  }

  async list(userId: string): Promise<WatchlistRecord[]> {
    await this.yieldToEventLoop();
    return [...this.itemsOf(userId)].sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime());
  }

  async find(userId: string, symbol: string): Promise<WatchlistRecord | null> {
    await this.yieldToEventLoop();
    return this.itemsOf(userId).find((item) => item.symbol === symbol) ?? null;
  }

  async count(userId: string): Promise<number> {
    await this.yieldToEventLoop();
    return this.itemsOf(userId).length;
  }

  async addWithinLimit(
    userId: string,
    item: NewWatchlistItem,
    maxItems: number,
  ): Promise<WatchlistRecord> {
    await this.yieldToEventLoop();
    // No await below this line: the check and the insert are atomic, like the locked transaction.
    if (this.knownUsers.size > 0 && !this.knownUsers.has(userId)) {
      throw new WatchlistOwnerNotFoundError();
    }
    const current = this.itemsOf(userId);
    if (current.some((existing) => existing.symbol === item.symbol)) {
      throw new DuplicateSymbolError();
    }
    if (current.length >= maxItems) throw new WatchlistFullError();
    const record: WatchlistRecord = { ...item, addedAt: new Date() };
    this.items.set(userId, [...current, record]);
    return record;
  }

  async remove(userId: string, symbol: string): Promise<boolean> {
    await this.yieldToEventLoop();
    const current = this.itemsOf(userId);
    const remaining = current.filter((item) => item.symbol !== symbol);
    this.items.set(userId, remaining);
    return remaining.length < current.length;
  }
}

export function makeQuote(symbol: string, overrides: Partial<ProviderQuote> = {}): ProviderQuote {
  return {
    symbol,
    name: `${symbol} Inc.`,
    exchange: 'NASDAQ',
    currency: 'USD',
    price: 100,
    change: 1,
    changePercent: 1.01,
    open: 99,
    high: 101,
    low: 98,
    previousClose: 99,
    volume: 1_000_000,
    fiftyTwoWeek: { low: 80, high: 120 },
    isMarketOpen: true,
    asOf: '2026-11-20T20:59:00.000Z',
    ...overrides,
  };
}

/**
 * Stands in for Twelve Data. Symbols in `knownSymbols` have quotes; any other symbol is
 * "not found". Records every call so tests can count the credits that would have been spent.
 */
export class FakeMarketDataProvider implements MarketDataProvider {
  readonly knownSymbols = new Map<string, ProviderQuote>();
  readonly quoteCalls: string[][] = [];
  readonly searchCalls: string[] = [];
  readonly seriesCalls: { symbol: string; params: TimeSeriesParams }[] = [];
  searchMatches: SymbolMatch[] = [];
  seriesPoints: ProviderSeries['points'] = [
    { t: '2026-11-19T00:00:00.000Z', close: 100 },
    { t: '2026-11-20T00:00:00.000Z', close: 110 },
  ];
  /** When set, every call rejects with it (e.g. a ProviderRateLimitError). */
  failWith: Error | null = null;
  /** Per-symbol failures inside an otherwise served batch (e.g. an entry that does not validate). */
  readonly symbolErrors = new Map<string, ProviderError>();
  /** When set, getQuotes waits for this promise before answering (to test dedupe). */
  quoteGate: Promise<void> | null = null;

  constructor(symbols: string[] = []) {
    for (const symbol of symbols) this.knownSymbols.set(symbol, makeQuote(symbol));
  }

  /** Credits a real provider would have charged so far. */
  get creditsSpent(): number {
    const quoteCredits = this.quoteCalls.reduce((sum, call) => sum + call.length, 0);
    return quoteCredits + this.searchCalls.length + this.seriesCalls.length;
  }

  async searchSymbols(query: string): Promise<SymbolMatch[]> {
    this.searchCalls.push(query);
    if (this.failWith) throw this.failWith;
    return this.searchMatches;
  }

  async getQuotes(symbols: readonly string[]): Promise<Map<string, ProviderQuoteOutcome>> {
    this.quoteCalls.push([...symbols]);
    if (this.quoteGate) await this.quoteGate;
    if (this.failWith) throw this.failWith;
    return new Map(
      symbols.map((symbol): [string, ProviderQuoteOutcome] => {
        const symbolError = this.symbolErrors.get(symbol);
        if (symbolError) return [symbol, { ok: false, error: symbolError }];
        const quote = this.knownSymbols.get(symbol);
        return [
          symbol,
          quote ? { ok: true, quote } : { ok: false, error: new ProviderNotFoundError() },
        ];
      }),
    );
  }

  async getTimeSeries(symbol: string, params: TimeSeriesParams): Promise<ProviderSeries> {
    this.seriesCalls.push({ symbol, params });
    if (this.failWith) throw this.failWith;
    if (!this.knownSymbols.has(symbol)) throw new ProviderNotFoundError();
    return { symbol, points: this.seriesPoints };
  }
}

/** A clock that only moves when the test says so. */
export class ManualClock {
  constructor(public current = Date.UTC(2026, 10, 20, 15, 0, 0)) {}

  readonly now: Clock = () => this.current;

  advance(ms: number): void {
    this.current += ms;
  }
}

export interface TestAppOptions {
  watchlistRepository?: WatchlistRepository;
  marketDataProvider?: MarketDataProvider;
  clock?: Clock;
  market?: Partial<MarketConfig>;
}

export function createTestApp(
  userRepository: UserRepository = new InMemoryUserRepository(),
  options: TestAppOptions = {},
) {
  const watchlistRepository = options.watchlistRepository ?? new InMemoryWatchlistRepository();
  const marketDataProvider = options.marketDataProvider ?? new FakeMarketDataProvider();
  const app = createApp({
    config: { ...testConfig, market: { ...testMarketConfig, ...options.market } },
    logger: pino({ level: 'silent' }),
    userRepository,
    watchlistRepository,
    marketDataProvider,
    ...(options.clock && { clock: options.clock }),
  });
  return { app, userRepository, watchlistRepository, marketDataProvider };
}

/** Bearer header for a user id, without going through /auth/login. */
export function bearerFor(userId: string, email = `${userId}@example.com`): string {
  const token = signAccessToken(
    { sub: userId, email },
    { secret: TEST_JWT_SECRET, expiresInSeconds: 3600 },
  );
  return `Bearer ${token}`;
}
