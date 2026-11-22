import type { ErrorCode } from '@ruut/shared';

export const HTTP_STATUS_BY_ERROR_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  INTERNAL_ERROR: 500,
};

/**
 * Expected, client-facing error. `message` is shown in the UI as is, so it must never
 * contain internal details. Anything that is not an AppError becomes INTERNAL_ERROR.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryAfter: number | undefined;

  constructor(code: ErrorCode, message: string, options: { retryAfter?: number } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = HTTP_STATUS_BY_ERROR_CODE[code];
    this.retryAfter = options.retryAfter;
  }
}

export const unauthorized = (message = 'Authentication required'): AppError =>
  new AppError('UNAUTHORIZED', message);

export const conflict = (message: string): AppError => new AppError('CONFLICT', message);

export const notFound = (message: string): AppError => new AppError('NOT_FOUND', message);

export const rateLimited = (retryAfter: number, message = 'Too many requests. Try again later.') =>
  new AppError('RATE_LIMITED', message, { retryAfter });
