import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from './lib/logger.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createAuthRateLimiters } from './middleware/rate-limit.js';
import { createRequestLogger } from './middleware/request-logger.js';
import type { UserRepository } from './modules/auth/user.repository.js';
import { createRoutes } from './routes.js';

export interface AppConfig {
  corsOrigins: string[];
  jwtSecret: string;
  jwtExpiresInSeconds: number;
}

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  userRepository: UserRepository;
}

/**
 * Builds the Express app from its dependencies. No env reads, no database connection and no
 * listen() here, so tests can create isolated instances with in-memory fakes.
 */
export function createApp(deps: AppDeps): Express {
  const { config, logger, userRepository } = deps;
  const app = express();

  // Exactly one proxy hop (Railway edge or the Next.js BFF) sets X-Forwarded-For; see spec 02 §4.
  app.set('trust proxy', 1);

  app.use(createRequestLogger(logger));
  app.use(helmet());
  // Unlisted origins simply get no CORS headers; the browser blocks them.
  app.use(cors({ origin: config.corsOrigins }));
  // Must run before the login limiter: its key reads the email from the parsed body.
  app.use(express.json({ limit: '10kb' }));

  app.use(
    createRoutes({
      userRepository,
      jwt: { secret: config.jwtSecret, expiresInSeconds: config.jwtExpiresInSeconds },
      requireAuth: createAuthMiddleware(config.jwtSecret),
      authRateLimiters: createAuthRateLimiters(),
    }),
  );

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
