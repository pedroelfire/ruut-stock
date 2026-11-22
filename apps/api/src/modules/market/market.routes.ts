import { Router } from 'express';
import type { MarketController } from './market.controller.js';

/** Mounted behind the auth middleware and the per-user rate limiter (see routes.ts). */
export function createMarketRouter(controller: MarketController): Router {
  const router = Router();

  router.get('/search', controller.search);
  router.get('/quote', controller.quote);
  router.get('/series/:symbol', controller.series);

  return router;
}
