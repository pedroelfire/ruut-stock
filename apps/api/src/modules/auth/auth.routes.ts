import { Router, type RequestHandler } from 'express';
import type { AuthController } from './auth.controller.js';

export interface AuthRouterDeps {
  controller: AuthController;
  requireAuth: RequestHandler;
  /** Order matters: the global safety net runs before the per email + IP limiter. */
  loginLimiters: RequestHandler[];
  registerLimiter: RequestHandler;
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const { controller, requireAuth, loginLimiters, registerLimiter } = deps;
  const router = Router();

  router.post('/register', registerLimiter, controller.register);
  router.post('/login', ...loginLimiters, controller.login);
  router.get('/me', requireAuth, controller.me);

  return router;
}
