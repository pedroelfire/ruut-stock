import { apiErrorResponseSchema, type ErrorCode } from '@ruut/shared';
import type { z } from 'zod';

export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';
export const NETWORK_ERROR_MESSAGE = 'Check your connection and try again.';

/** Every failed call to the BFF or the API surfaces as this error, in the client and the server. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  /** HTTP status; 0 when the request never got a response (network failure). */
  readonly status: number;
  /** Seconds until a retry makes sense; set on RATE_LIMITED. */
  readonly retryAfter: number | undefined;

  constructor(code: ErrorCode, message: string, status: number, retryAfter?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Code for an error body we could not read, inferred from the status. */
function codeForStatus(status: number): ErrorCode {
  if (status === 400 || status === 422) return 'VALIDATION_ERROR';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 502 || status === 503 || status === 504) return 'UPSTREAM_ERROR';
  return 'INTERNAL_ERROR';
}

/** `Retry-After` in delta-seconds; HTTP dates are not used by the API and are ignored. */
function parseRetryAfterHeader(value: string | null): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Maps a non-2xx response to an ApiError, preferring the `{ error }` body over the status. */
export async function toApiError(response: Response): Promise<ApiError> {
  const headerRetryAfter = parseRetryAfterHeader(response.headers.get('retry-after'));
  const parsed = apiErrorResponseSchema.safeParse(await readJson(response));
  if (parsed.success) {
    const { code, message, retryAfter } = parsed.data.error;
    return new ApiError(code, message, response.status, retryAfter ?? headerRetryAfter);
  }
  return new ApiError(
    codeForStatus(response.status),
    GENERIC_ERROR_MESSAGE,
    response.status,
    headerRetryAfter,
  );
}

/** Validates a 2xx body against its contract; a body that does not match is an error too. */
export async function parseResponse<TSchema extends z.ZodType>(
  response: Response,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  const parsed = schema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw new ApiError('INTERNAL_ERROR', GENERIC_ERROR_MESSAGE, response.status);
  }
  return parsed.data;
}
