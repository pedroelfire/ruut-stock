import { Router } from 'express';
import type { WatchlistController } from './watchlist.controller.js';

/** Mounted behind the auth middleware and the per-user rate limiter (see routes.ts). */
export function createWatchlistRouter(controller: WatchlistController): Router {
  const router = Router();

  router.get('/', controller.list);
  router.post('/', controller.add);
  router.delete('/:symbol', controller.remove);

  return router;
}
