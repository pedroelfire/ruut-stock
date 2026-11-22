import { describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client.js';
import {
  createPrismaWatchlistRepository,
  DuplicateSymbolError,
  WatchlistFullError,
  WatchlistOwnerNotFoundError,
} from '../src/modules/watchlist/watchlist.repository.js';

const item = { symbol: 'AMD', name: 'Advanced Micro Devices, Inc.', exchange: 'NASDAQ' };

/**
 * Only $transaction and the calls made inside it are faked; the cast keeps the fake minimal.
 * `lockedRows` is what the SELECT ... FOR UPDATE on the owner returns.
 */
function fakePrisma(options: {
  lockedRows?: { id: string }[];
  count?: number;
  createError?: unknown;
}) {
  const create = vi.fn(async () => {
    if (options.createError) throw options.createError;
    return { ...item, addedAt: new Date() };
  });
  const queryRaw = vi.fn(async () => options.lockedRows ?? [{ id: 'user-1' }]);
  const tx = {
    $queryRaw: queryRaw,
    watchlistItem: { count: vi.fn(async () => options.count ?? 0), create },
  };
  const prisma = { $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) };
  return { prisma: prisma as unknown as PrismaClient, create, queryRaw };
}

describe('createPrismaWatchlistRepository.addWithinLimit', () => {
  it('locks the owner row before counting, then inserts', async () => {
    const { prisma, create, queryRaw } = fakePrisma({ count: 7 });

    await createPrismaWatchlistRepository(prisma).addWithinLimit('user-1', item, 8);

    const [sql] = queryRaw.mock.calls[0] as unknown as [TemplateStringsArray];
    expect(sql.join('?')).toMatch(/FOR UPDATE/);
    expect(create).toHaveBeenCalledOnce();
  });

  it('throws WatchlistFullError at the limit without inserting', async () => {
    const { prisma, create } = fakePrisma({ count: 8 });

    await expect(
      createPrismaWatchlistRepository(prisma).addWithinLimit('user-1', item, 8),
    ).rejects.toBeInstanceOf(WatchlistFullError);
    expect(create).not.toHaveBeenCalled();
  });

  it('throws WatchlistOwnerNotFoundError when the user no longer exists', async () => {
    const { prisma } = fakePrisma({ lockedRows: [] });

    await expect(
      createPrismaWatchlistRepository(prisma).addWithinLimit('ghost', item, 8),
    ).rejects.toBeInstanceOf(WatchlistOwnerNotFoundError);
  });

  it('maps a P2002 unique violation to DuplicateSymbolError', async () => {
    const uniqueViolation = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.10.1',
    });
    const { prisma } = fakePrisma({ createError: uniqueViolation });

    await expect(
      createPrismaWatchlistRepository(prisma).addWithinLimit('user-1', item, 8),
    ).rejects.toBeInstanceOf(DuplicateSymbolError);
  });
});
