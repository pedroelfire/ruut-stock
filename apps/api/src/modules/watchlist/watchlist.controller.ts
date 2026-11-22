import {
  addWatchlistItemBodySchema,
  watchlistSymbolParamsSchema,
  type AddWatchlistItemResponse,
  type WatchlistResponse,
} from '@ruut/shared';
import type { Request, Response } from 'express';
import { requireAuthUser } from '../../middleware/auth.js';
import type { WatchlistService } from './watchlist.service.js';

export interface WatchlistController {
  list(req: Request, res: Response): Promise<void>;
  add(req: Request, res: Response): Promise<void>;
  remove(req: Request, res: Response): Promise<void>;
}

/** HTTP translation only. The user always comes from the verified token, never from the input. */
export function createWatchlistController(watchlistService: WatchlistService): WatchlistController {
  return {
    async list(req, res) {
      const body: WatchlistResponse = await watchlistService.list(requireAuthUser(req).id);
      res.status(200).json(body);
    },

    async add(req, res) {
      const { symbol } = addWatchlistItemBodySchema.parse(req.body);
      const entry = await watchlistService.add(requireAuthUser(req).id, symbol);
      const body: AddWatchlistItemResponse = { data: entry };
      res.status(201).json(body);
    },

    async remove(req, res) {
      const { symbol } = watchlistSymbolParamsSchema.parse(req.params);
      await watchlistService.remove(requireAuthUser(req).id, symbol);
      res.status(204).end();
    },
  };
}
