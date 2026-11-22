import { WATCHLIST_MAX_SYMBOLS, type WatchlistEntry, type WatchlistResponse } from '@ruut/shared';
import { AppError, conflict, notFound, rateLimited, unauthorized } from '../../lib/errors.js';
import {
  MARKET_LIMIT_MESSAGE,
  UPSTREAM_MESSAGE,
  type MarketService,
} from '../market/market.service.js';
import { partialMeta } from '../market/quote-response.js';
import {
  DuplicateSymbolError,
  WatchlistFullError,
  WatchlistOwnerNotFoundError,
  type WatchlistRecord,
  type WatchlistRepository,
} from './watchlist.repository.js';

const DUPLICATE_MESSAGE = 'This symbol is already in your watchlist';
const FULL_MESSAGE = `Your watchlist is full (${WATCHLIST_MAX_SYMBOLS} symbols max)`;

export interface WatchlistService {
  list(userId: string): Promise<WatchlistResponse>;
  add(userId: string, symbol: string): Promise<WatchlistEntry>;
  remove(userId: string, symbol: string): Promise<void>;
}

const toEntry = (record: WatchlistRecord): WatchlistEntry => ({
  symbol: record.symbol,
  name: record.name,
  addedAt: record.addedAt.toISOString(),
});

/** Symbols arrive validated and uppercased by the shared Zod schemas. */
export function createWatchlistService(deps: {
  watchlistRepository: WatchlistRepository;
  marketService: MarketService;
}): WatchlistService {
  const { watchlistRepository: repository, marketService } = deps;

  /** Spec 02 §4: needs the provider's name and exchange, and proves the symbol exists. */
  async function lookUpSymbol(symbol: string): Promise<{ name: string; exchange: string }> {
    const result = await marketService.getQuotes([symbol]);
    const lookup = result.lookups.get(symbol);
    switch (lookup?.status) {
      case 'ok':
        return { name: lookup.quote.name, exchange: lookup.quote.exchange };
      case 'not_found':
        throw notFound('Symbol not found');
      case 'rate_limited':
        throw rateLimited(result.retryAfter, MARKET_LIMIT_MESSAGE);
      default:
        throw new AppError('UPSTREAM_ERROR', UPSTREAM_MESSAGE);
    }
  }

  return {
    async list(userId) {
      const records = await repository.list(userId);
      if (records.length === 0) return { data: [] };

      const result = await marketService.getQuotes(records.map((record) => record.symbol));
      const data = records.map((record) => {
        const lookup = result.lookups.get(record.symbol);
        // Items always show up; without a quote (fresh or stale) they carry quote: null.
        return { ...toEntry(record), quote: lookup?.status === 'ok' ? lookup.quote : null };
      });
      const meta = partialMeta(result);
      return meta ? { data, meta } : { data };
    },

    async add(userId, symbol) {
      // Cheapest checks first, so a duplicate or a full list never spends provider credits.
      if (await repository.find(userId, symbol)) throw conflict(DUPLICATE_MESSAGE);
      if ((await repository.count(userId)) >= WATCHLIST_MAX_SYMBOLS) throw conflict(FULL_MESSAGE);

      const { name, exchange } = await lookUpSymbol(symbol);

      try {
        // The repository re-checks both rules atomically: concurrent adds may pass the checks above.
        const record = await repository.addWithinLimit(
          userId,
          { symbol, name, exchange },
          WATCHLIST_MAX_SYMBOLS,
        );
        return toEntry(record);
      } catch (error) {
        if (error instanceof DuplicateSymbolError) throw conflict(DUPLICATE_MESSAGE);
        if (error instanceof WatchlistFullError) throw conflict(FULL_MESSAGE);
        if (error instanceof WatchlistOwnerNotFoundError) {
          // The token is valid but its user was deleted: same answer as GET /auth/me.
          throw unauthorized('Invalid or expired token');
        }
        throw error;
      }
    },

    async remove(userId, symbol) {
      const removed = await repository.remove(userId, symbol);
      if (!removed) throw notFound('Symbol is not in your watchlist');
    },
  };
}
