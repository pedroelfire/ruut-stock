import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';

export interface WatchlistRecord {
  symbol: string;
  name: string;
  exchange: string | null;
  addedAt: Date;
}

export interface NewWatchlistItem {
  symbol: string;
  name: string;
  exchange: string | null;
}

/** The symbol is already in this user's watchlist (unique index on userId + symbol). */
export class DuplicateSymbolError extends Error {
  constructor() {
    super('Symbol already in watchlist');
    this.name = 'DuplicateSymbolError';
  }
}

/** The watchlist already holds the maximum number of symbols. */
export class WatchlistFullError extends Error {
  constructor() {
    super('Watchlist is full');
    this.name = 'WatchlistFullError';
  }
}

/** The user in the token no longer exists. */
export class WatchlistOwnerNotFoundError extends Error {
  constructor() {
    super('Watchlist owner not found');
    this.name = 'WatchlistOwnerNotFoundError';
  }
}

/**
 * Persistence boundary of the watchlist module. Every method is scoped to one user, so a
 * caller cannot read or change another user's items by mistake.
 */
export interface WatchlistRepository {
  /** Ordered by addedAt ascending. */
  list(userId: string): Promise<WatchlistRecord[]>;
  find(userId: string, symbol: string): Promise<WatchlistRecord | null>;
  count(userId: string): Promise<number>;
  /**
   * Counts and inserts atomically, so concurrent adds cannot exceed `maxItems`. Throws
   * DuplicateSymbolError, WatchlistFullError or WatchlistOwnerNotFoundError.
   */
  addWithinLimit(
    userId: string,
    item: NewWatchlistItem,
    maxItems: number,
  ): Promise<WatchlistRecord>;
  /** false when the symbol was not in the watchlist. */
  remove(userId: string, symbol: string): Promise<boolean>;
}

const recordSelect = { symbol: true, name: true, exchange: true, addedAt: true } as const;

// See https://www.prisma.io/docs/orm/reference/error-reference
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}

export function createPrismaWatchlistRepository(prisma: PrismaClient): WatchlistRepository {
  return {
    list: (userId) =>
      prisma.watchlistItem.findMany({
        where: { userId },
        orderBy: [{ addedAt: 'asc' }, { symbol: 'asc' }],
        select: recordSelect,
      }),

    find: (userId, symbol) =>
      prisma.watchlistItem.findUnique({
        where: { userId_symbol: { userId, symbol } },
        select: recordSelect,
      }),

    count: (userId) => prisma.watchlistItem.count({ where: { userId } }),

    async addWithinLimit(userId, item, maxItems) {
      try {
        return await prisma.$transaction(async (tx) => {
          // A plain transaction is not enough under READ COMMITTED: two of them could both count
          // 7 and both insert. Locking the owner's row makes adds for the same user run in turn.
          const owner = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
          if (owner.length === 0) throw new WatchlistOwnerNotFoundError();

          const count = await tx.watchlistItem.count({ where: { userId } });
          if (count >= maxItems) throw new WatchlistFullError();

          return await tx.watchlistItem.create({
            data: { userId, ...item },
            select: recordSelect,
          });
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new DuplicateSymbolError();
        throw error;
      }
    },

    async remove(userId, symbol) {
      const { count } = await prisma.watchlistItem.deleteMany({ where: { userId, symbol } });
      return count > 0;
    },
  };
}
