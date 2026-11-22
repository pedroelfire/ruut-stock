import { emailSchema } from '@ruut/shared';
import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit, type AugmentedRequest, type Options } from 'express-rate-limit';
import { rateLimited } from '../lib/errors.js';

const MINUTE_MS = 60_000;

/** Spec 02 §4. Exposed so tests can assert against the same numbers the app uses. */
export const AUTH_RATE_LIMITS = {
  loginFailuresPerEmailAndIp: { limit: 10, windowMs: 15 * MINUTE_MS },
  loginGlobal: { limit: 300, windowMs: 15 * MINUTE_MS },
  registerPerIp: { limit: 10, windowMs: 60 * MINUTE_MS },
} as const;

/** Used as the email part of the key when the body has no valid email. */
const INVALID_EMAIL_KEY = 'invalid';

function secondsUntilReset(req: Request, options: Options): number {
  // express-rate-limit stores the current window info on req[requestPropertyName].
  const info = (req as AugmentedRequest)[options.requestPropertyName];
  const resetTime = info?.resetTime;
  if (!resetTime) return Math.ceil(options.windowMs / 1000);
  return Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
}

/** Routes the rejection through the central error handler so the body keeps the standard format. */
function createLimiter(options: Partial<Options>): RequestHandler {
  return rateLimit({
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, _res, next, optionsUsed) => {
      next(rateLimited(secondsUntilReset(req, optionsUsed), 'Too many attempts. Try again later.'));
    },
    ...options,
  });
}

/** `req.ip` is the real client IP because the app sets `trust proxy` to 1 (spec 02 §4). */
function clientIpKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? 'unknown');
}

/**
 * Key for failed logins: normalized email + client IP. Whoever mistypes the demo password only
 * blocks themselves, not every visitor using the demo button. Requires the JSON parser before it.
 */
export function loginAttemptKey(req: Request): string {
  const body: unknown = req.body;
  const rawEmail =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'email') : undefined;
  const parsed = emailSchema.safeParse(rawEmail);
  const email = parsed.success ? parsed.data : INVALID_EMAIL_KEY;
  return `${email}|${clientIpKey(req)}`;
}

export interface AuthRateLimiters {
  /** Global safety net first, then failed attempts per email + IP. */
  login: RequestHandler[];
  register: RequestHandler;
}

/**
 * Built per app instance so each createApp call (and each test) gets its own in-memory store.
 * A single API instance on Railway makes the memory store sufficient.
 */
export function createAuthRateLimiters(): AuthRateLimiters {
  const { loginFailuresPerEmailAndIp, loginGlobal, registerPerIp } = AUTH_RATE_LIMITS;

  const loginGlobalLimiter = createLimiter({
    ...loginGlobal,
    // Every login costs a bcrypt comparison, so cap the total regardless of who sends it.
    keyGenerator: () => 'login:global',
  });

  const loginFailureLimiter = createLimiter({
    ...loginFailuresPerEmailAndIp,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `login:${loginAttemptKey(req)}`,
  });

  const registerLimiter = createLimiter({
    ...registerPerIp,
    keyGenerator: (req) => `register:${clientIpKey(req)}`,
  });

  return { login: [loginGlobalLimiter, loginFailureLimiter], register: registerLimiter };
}
