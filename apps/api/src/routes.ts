import { Router, type RequestHandler } from 'express';
import type { JwtConfig } from './lib/jwt.js';
import type { AuthRateLimiters } from './middleware/rate-limit.js';
import { createAuthController } from './modules/auth/auth.controller.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createAuthService } from './modules/auth/auth.service.js';
import type { UserRepository } from './modules/auth/user.repository.js';
import { createMarketController } from './modules/market/market.controller.js';
import { createMarketRouter } from './modules/market/market.routes.js';
import type { MarketService } from './modules/market/market.service.js';
import { createWatchlistController } from './modules/watchlist/watchlist.controller.js';
import type { WatchlistRepository } from './modules/watchlist/watchlist.repository.js';
import { createWatchlistRouter } from './modules/watchlist/watchlist.routes.js';
import { createWatchlistService } from './modules/watchlist/watchlist.service.js';

export interface RoutesDeps {
  userRepository: UserRepository;
  watchlistRepository: WatchlistRepository;
  marketService: MarketService;
  jwt: JwtConfig;
  requireAuth: RequestHandler;
  authRateLimiters: AuthRateLimiters;
  /** Keyed by req.user, so it must come after requireAuth. One instance for every route. */
  userRateLimiter: RequestHandler;
}

/** Wires every module. */
export function createRoutes(deps: RoutesDeps): Router {
  const router = Router();

  // Railway healthcheck: no auth, no database, no provider.
  router.get('/health', (_req, res) => {
    res.status(200).json({ data: { status: 'ok' } });
  });

  const authService = createAuthService({ userRepository: deps.userRepository, jwt: deps.jwt });
  router.use(
    '/auth',
    createAuthRouter({
      controller: createAuthController(authService),
      requireAuth: deps.requireAuth,
      loginLimiters: deps.authRateLimiters.login,
      registerLimiter: deps.authRateLimiters.register,
    }),
  );

  // Everything outside /auth requires a token, then counts against the user's request limit.
  const protectedRoute = [deps.requireAuth, deps.userRateLimiter];

  router.use(
    '/market',
    ...protectedRoute,
    createMarketRouter(createMarketController(deps.marketService)),
  );

  const watchlistService = createWatchlistService({
    watchlistRepository: deps.watchlistRepository,
    marketService: deps.marketService,
  });
  router.use(
    '/watchlist',
    ...protectedRoute,
    createWatchlistRouter(createWatchlistController(watchlistService)),
  );

  return router;
}
