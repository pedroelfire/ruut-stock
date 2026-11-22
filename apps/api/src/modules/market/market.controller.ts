import {
  quoteQuerySchema,
  searchQuerySchema,
  seriesParamsSchema,
  seriesQuerySchema,
  type QuoteResponse,
  type SearchResponse,
  type SeriesResponse,
} from '@ruut/shared';
import type { Request, Response } from 'express';
import type { MarketService } from './market.service.js';
import { toQuoteResponse } from './quote-response.js';

export interface MarketController {
  search(req: Request, res: Response): Promise<void>;
  quote(req: Request, res: Response): Promise<void>;
  series(req: Request, res: Response): Promise<void>;
}

/** HTTP translation only: parse the input, call the service, shape the response. */
export function createMarketController(marketService: MarketService): MarketController {
  return {
    async search(req, res) {
      const { q } = searchQuerySchema.parse(req.query);
      const body: SearchResponse = { data: await marketService.search(q) };
      res.status(200).json(body);
    },

    async quote(req, res) {
      const { symbols } = quoteQuerySchema.parse(req.query);
      const result = await marketService.getQuotes(symbols);
      const body: QuoteResponse = toQuoteResponse(symbols, result);
      res.status(200).json(body);
    },

    async series(req, res) {
      const { symbol } = seriesParamsSchema.parse(req.params);
      const { range } = seriesQuerySchema.parse(req.query);
      const body: SeriesResponse = { data: await marketService.getSeries(symbol, range) };
      res.status(200).json(body);
    },
  };
}
