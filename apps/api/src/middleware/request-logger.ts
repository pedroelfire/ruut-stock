import type { IncomingMessage, ServerResponse } from 'node:http';
import { pinoHttp } from 'pino-http';
import type { Logger } from '../lib/logger.js';

/**
 * One line per request with method, url, status and duration (spec 02 §6). Headers and bodies
 * are never serialized, so the Authorization header and auth payloads cannot reach the logs.
 */
export function createRequestLogger(logger: Logger) {
  return pinoHttp({
    logger,
    // The Railway healthcheck would otherwise flood the logs.
    autoLogging: { ignore: (req) => req.url === '/health' },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req: IncomingMessage & { method?: string; url?: string }) => ({
        method: req.method,
        url: req.url,
      }),
      res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
    },
  });
}
