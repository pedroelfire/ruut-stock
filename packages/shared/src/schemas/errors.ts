import { z } from 'zod';

/** Every error code the API can return. HTTP status mapping lives in the API (spec 02 §2). */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  'INTERNAL_ERROR',
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorBodySchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  /** Seconds until the client may retry; only present on RATE_LIMITED. */
  retryAfter: z.number().int().nonnegative().optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

export const apiErrorResponseSchema = z.object({
  error: apiErrorBodySchema,
});
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
