import { Router, type RequestHandler } from 'express';
import type { JwtConfig } from './lib/jwt.js';
import type { AuthRateLimiters } from './middleware/rate-limit.js';
import { createAuthController } from './modules/auth/auth.controller.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createAuthService } from './modules/auth/auth.service.js';
import type { UserRepository } from './modules/auth/user.repository.js';

export interface RoutesDeps {
  userRepository: UserRepository;
  jwt: JwtConfig;
  requireAuth: RequestHandler;
  authRateLimiters: AuthRateLimiters;
}

/** Wires every module. Market and watchlist routers join here in Phase 2. */
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

  return router;
}
