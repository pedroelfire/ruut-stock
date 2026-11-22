export interface ProviderErrorOptions {
  /**
   * true only when the provider did not charge the call: it answered with an error status or a
   * Twelve Data error body (401, 403, 5xx, 429), or it could not be reached. A 2xx response
   * that we fail to validate was served, and therefore charged, so it is never refundable.
   */
  refundable?: boolean;
  /**
   * true when the failure says nothing about the request itself and would hit any other call
   * too (invalid key, provider down or unreachable). It trips the market service's short cooldown.
   */
  affectsAllRequests?: boolean;
}

/**
 * Provider failures. Their messages are for logs only: the market service turns them into
 * AppErrors with fixed, client-safe messages. They never contain the request URL (it has the key).
 */
export class ProviderError extends Error {
  readonly refundable: boolean;
  readonly affectsAllRequests: boolean;

  constructor(message: string, options: ProviderErrorOptions = {}) {
    super(message);
    this.name = 'ProviderError';
    this.refundable = options.refundable ?? false;
    this.affectsAllRequests = options.affectsAllRequests ?? false;
  }
}

/** HTTP 429 or `code: 429` in the body: the provider's own credit limit was hit. */
export class ProviderRateLimitError extends ProviderError {
  constructor(message = 'Twelve Data credit limit reached') {
    // A rejected request is not charged. The budget, not the cooldown, handles the wait.
    super(message, { refundable: true });
    this.name = 'ProviderRateLimitError';
  }
}

/** Twelve Data error body with code 400/404 for an unknown or invalid symbol. */
export class ProviderNotFoundError extends ProviderError {
  constructor(message = 'Symbol not found') {
    // Conservative: assume the lookup was charged (the negative cache avoids repeating it).
    super(message, { refundable: false });
    this.name = 'ProviderNotFoundError';
  }
}

const RATE_LIMIT_CODE = 429;
const NOT_FOUND_CODES = new Set([400, 404]);

/** Invalid key or server failure: every request would fail the same way. */
const isProviderWideCode = (code: number): boolean => code === 401 || code >= 500;

/** Mapping for the `code` field of a Twelve Data error body. */
export function providerErrorFromCode(code: number, message: string): ProviderError {
  if (code === RATE_LIMIT_CODE) return new ProviderRateLimitError(message);
  if (NOT_FOUND_CODES.has(code)) return new ProviderNotFoundError(message);
  return new ProviderError(`Twelve Data error ${code}: ${message}`, {
    // Invalid key, plan restriction or server failure: nothing was served.
    refundable: code === 401 || code === 403 || code >= 500,
    affectsAllRequests: isProviderWideCode(code),
  });
}

/**
 * Mapping for an HTTP error status without a Twelve Data error body (a proxy page, a gateway
 * error). No data was served, so the credit is refundable. Only 429 is meaningful on its own:
 * a bare 4xx may come from a proxy or a wrong path, so it never means "not found".
 */
export function providerErrorFromStatus(status: number): ProviderError {
  if (status === RATE_LIMIT_CODE) return new ProviderRateLimitError(`HTTP ${status}`);
  return new ProviderError(`Twelve Data HTTP ${status}`, {
    refundable: true,
    affectsAllRequests: isProviderWideCode(status),
  });
}
