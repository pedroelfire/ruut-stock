import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { TtlCache } from './lib/cache.js';
import { systemClock, type Clock } from './lib/clock.js';
import { createCreditBudget } from './lib/credit-budget.js';
import type { Logger } from './lib/logger.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createAuthRateLimiters, createUserRateLimiter } from './middleware/rate-limit.js';
import { createRequestLogger } from './middleware/request-logger.js';
import type { UserRepository } from './modules/auth/user.repository.js';
import { createMarketService } from './modules/market/market.service.js';
import type { WatchlistRepository } from './modules/watchlist/watchlist.repository.js';
import type { MarketDataProvider } from './providers/twelve-data/index.js';
import { createRoutes } from './routes.js';

export interface MarketConfig {
  creditsPerMinute: number;
  creditsPerDay: number;
  delayMinutes: number;
}

export interface AppConfig {
  corsOrigins: string[];
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  market: MarketConfig;
}

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  userRepository: UserRepository;
  watchlistRepository: WatchlistRepository;
  /** The Twelve Data client in production; a fake in tests, so they never touch the network. */
  marketDataProvider: MarketDataProvider;
  /** Drives cache expiry and credit windows. Defaults to the system clock. */
  clock?: Clock;
}

/**
 * Builds the Express app from its dependencies. No env reads, no database connection and no
 * listen() here, so tests can create isolated instances with in-memory fakes.
 */
export function createApp(deps: AppDeps): Express {
  const { config, logger, userRepository, watchlistRepository, marketDataProvider } = deps;
  const clock = deps.clock ?? systemClock;
  const app = express();

  // Exactly one proxy hop (Railway edge or the Next.js BFF) sets X-Forwarded-For; see spec 02 §4.
  app.set('trust proxy', 1);

  app.use(createRequestLogger(logger));
  app.use(helmet());
  // Unlisted origins simply get no CORS headers; the browser blocks them.
  app.use(cors({ origin: config.corsOrigins }));
  // Must run before the login limiter: its key reads the email from the parsed body.
  app.use(express.json({ limit: '10kb' }));

  // One cache and one budget per app: every user shares the same Twelve Data credits.
  const marketService = createMarketService({
    provider: marketDataProvider,
    cache: new TtlCache({ now: clock }),
    budget: createCreditBudget({
      perMinute: config.market.creditsPerMinute,
      perDay: config.market.creditsPerDay,
      now: clock,
    }),
    logger,
    delayMinutes: config.market.delayMinutes,
    now: clock,
  });

  app.use(
    createRoutes({
      userRepository,
      watchlistRepository,
      marketService,
      jwt: { secret: config.jwtSecret, expiresInSeconds: config.jwtExpiresInSeconds },
      requireAuth: createAuthMiddleware(config.jwtSecret),
      authRateLimiters: createAuthRateLimiters(),
      userRateLimiter: createUserRateLimiter(),
    }),
  );

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
