import type { ApiErrorResponse } from '@ruut/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, notFound } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';

/**
 * Client errors raised by Express internals and body-parser (http-errors): a numeric 4xx `status`
 * and `expose: true`, e.g. entity.parse.failed, entity.too.large, charset.unsupported or
 * encoding.unsupported. Returns their body-parser `type`, or '' when they have none.
 */
function exposedClientErrorType(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const status: unknown = Reflect.get(error, 'status');
  const expose: unknown = Reflect.get(error, 'expose');
  const isClientError = typeof status === 'number' && status >= 400 && status < 500;
  if (!isClientError || expose !== true) return null;
  const type: unknown = Reflect.get(error, 'type');
  return typeof type === 'string' ? type : '';
}

function toAppError(error: unknown): AppError | null {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    const message = error.issues[0]?.message ?? 'Invalid request';
    return new AppError('VALIDATION_ERROR', message);
  }

  // Fixed messages: the library's own text may describe internals and is never forwarded.
  switch (exposedClientErrorType(error)) {
    case null:
      return null;
    case 'entity.too.large':
      return new AppError('VALIDATION_ERROR', 'Request body is too large');
    case 'entity.parse.failed':
      return new AppError('VALIDATION_ERROR', 'Request body must be valid JSON');
    case 'charset.unsupported':
    case 'encoding.unsupported':
      return new AppError('VALIDATION_ERROR', 'Unsupported request body encoding');
    default:
      return new AppError('VALIDATION_ERROR', 'Invalid request');
  }
}

/** 404 for any route that no router handled. Mount after every router. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(notFound('Route not found'));
};

/**
 * Single place that turns errors into `{ error: { code, message, retryAfter? } }`.
 * Unknown errors are logged with their stack and answered with a generic message.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    if (res.headersSent) return next(error);

    const appError = toAppError(error);
    if (!appError) {
      logger.error({ err: error, method: req.method, url: req.originalUrl }, 'Unhandled error');
    }

    const resolved = appError ?? new AppError('INTERNAL_ERROR', 'Something went wrong');
    if (resolved.retryAfter !== undefined) {
      res.setHeader('Retry-After', String(resolved.retryAfter));
    }

    const body: ApiErrorResponse = {
      error: {
        code: resolved.code,
        message: resolved.message,
        ...(resolved.retryAfter !== undefined && { retryAfter: resolved.retryAfter }),
      },
    };
    res.status(resolved.status).json(body);
  };
}
