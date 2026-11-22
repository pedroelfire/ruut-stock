import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createPrismaClient } from './lib/prisma.js';
import { createPrismaUserRepository } from './modules/auth/user.repository.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function main(): void {
  // Throws before anything else starts if a required variable is missing or invalid.
  const env = loadEnv();
  const logger = createLogger({ level: env.LOG_LEVEL });
  const prisma = createPrismaClient(env.DATABASE_URL);

  const app = createApp({
    config: {
      corsOrigins: env.CORS_ORIGIN,
      jwtSecret: env.JWT_SECRET,
      jwtExpiresInSeconds: env.JWT_EXPIRES_IN,
    },
    logger,
    userRepository: createPrismaUserRepository(prisma),
  });

  // '::' listens on every IPv6 and IPv4 interface (dual-stack). Railway needs all interfaces, and
  // its private network can be IPv6-only, so neither localhost nor 0.0.0.0 would be enough.
  // Express 5 also registers this callback for the server 'error' event (e.g. EADDRINUSE).
  const server = app.listen(env.PORT, '::', (error?: Error) => {
    if (error) {
      logger.fatal({ err: error }, 'Failed to start API');
      process.exit(1);
    }
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'Shutting down');
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

try {
  main();
} catch (error) {
  // The logger may not exist yet (invalid env), so fall back to stderr.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
