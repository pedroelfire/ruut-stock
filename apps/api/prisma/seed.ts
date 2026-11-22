// Creates (or refreshes) the demo user and its watchlist. Idempotent: safe to run more than once.
// Names are hardcoded so seeding never spends Twelve Data credits (spec 02 §3).
import { loadSeedEnv } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';
import { hashPassword } from '../src/lib/password.js';
import { createPrismaClient } from '../src/lib/prisma.js';

const DEMO_WATCHLIST = [
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', exchange: 'NASDAQ' },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', exchange: 'NASDAQ' },
] as const;

async function seed(): Promise<void> {
  // Fails with a clear message if DEMO_USER_PASSWORD is missing.
  const env = loadSeedEnv();
  const prisma = createPrismaClient(env.DATABASE_URL);

  try {
    const passwordHash = await hashPassword(env.DEMO_USER_PASSWORD);

    await prisma.$transaction(async (tx) => {
      // Updating the hash keeps the account in sync if DEMO_USER_PASSWORD changes.
      const user = await tx.user.upsert({
        where: { email: env.DEMO_USER_EMAIL },
        update: { passwordHash },
        create: { email: env.DEMO_USER_EMAIL, passwordHash },
        select: { id: true },
      });

      await tx.watchlistItem.createMany({
        data: DEMO_WATCHLIST.map((item) => ({ ...item, userId: user.id })),
        skipDuplicates: true,
      });
    });

    createLogger({ level: 'info' }).info(
      { symbols: DEMO_WATCHLIST.map((item) => item.symbol) },
      'Seeded demo user and watchlist',
    );
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
