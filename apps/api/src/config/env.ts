// The only module allowed to read process.env (CLAUDE.md). Everything else receives typed config.
import { existsSync } from 'node:fs';
import { emailSchema, passwordSchema } from '@ruut/shared';
import { z } from 'zod';

const DURATION_UNITS_IN_SECONDS = { s: 1, m: 60, h: 3600, d: 86_400 } as const;

/** Parses "3600", "90s", "15m", "1h" or "7d" into seconds. */
export function parseDurationToSeconds(value: string): number | null {
  const match = /^(\d+)([smhd])?$/.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] ?? 's') as keyof typeof DURATION_UNITS_IN_SECONDS;
  const seconds = amount * DURATION_UNITS_IN_SECONDS[unit];
  return seconds > 0 ? seconds : null;
}

const durationSchema = z.string().transform((value, ctx) => {
  const seconds = parseDurationToSeconds(value);
  if (seconds === null) {
    ctx.addIssue({ code: 'custom', message: 'Expected a duration such as 3600, 15m, 1h or 7d' });
    return z.NEVER;
  }
  return seconds;
});

/**
 * Returns the bare origin (scheme://host[:port]) or null. Browsers send Origin without a trailing
 * slash, so 'http://localhost:3000/' is normalized; anything with a path, query, hash or
 * credentials is rejected instead of silently never matching.
 */
export function toOrigin(value: string): string | null {
  if (!URL.canParse(value)) return null;
  const url = new URL(value);
  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
  const hasExtras =
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.username !== '' ||
    url.password !== '';
  return isHttp && !hasExtras ? url.origin : null;
}

const originListSchema = z.string().transform((value, ctx) => {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'Expected at least one origin' });
    return z.NEVER;
  }
  const normalized: string[] = [];
  for (const origin of origins) {
    const parsed = toOrigin(origin);
    if (!parsed) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid origin: ${origin} (expected scheme://host[:port], no path or query)`,
      });
      return z.NEVER;
    }
    normalized.push(parsed);
  }
  return normalized;
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: durationSchema.default(3600),
  CORS_ORIGIN: originListSchema,
  TWELVE_DATA_API_KEY: z.string().min(1),
  TWELVE_DATA_BASE_URL: z.url().default('https://api.twelvedata.com'),
  TWELVE_DATA_CREDITS_PER_MINUTE: z.coerce.number().int().positive().default(8),
  TWELVE_DATA_CREDITS_PER_DAY: z.coerce.number().int().positive().default(800),
  TWELVE_DATA_DELAY_MINUTES: z.coerce.number().int().nonnegative().default(0),
  // DEMO_USER_* are seed-only (spec 02 §7): the server neither reads nor validates them.
});

export type Env = z.infer<typeof envSchema>;

const seedEnvSchema = z.object({
  DATABASE_URL: z.url(),
  DEMO_USER_EMAIL: emailSchema.default('demo@example.com'),
  DEMO_USER_PASSWORD: passwordSchema.optional(),
});

export type SeedEnv = z.infer<typeof seedEnvSchema> & { DEMO_USER_PASSWORD: string };

export class EnvValidationError extends Error {
  constructor(issues: z.core.$ZodIssue[]) {
    // Only variable names and rule messages: never echo the received values (they may be secrets).
    const details = issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    super(`Invalid environment variables:\n${details}`);
    this.name = 'EnvValidationError';
  }
}

/** Local development reads apps/api/.env; on Railway the variables are injected and no file exists. */
function loadDotEnvFile(): void {
  if (existsSync('.env')) {
    // Never overrides variables that are already set in the real environment.
    process.loadEnvFile('.env');
  }
}

function parseWith<T extends z.ZodType>(schema: T, source: NodeJS.ProcessEnv): z.infer<T> {
  // Empty strings (e.g. "DEMO_USER_PASSWORD=" copied from .env.example) count as unset.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = schema.safeParse(cleaned);
  if (!result.success) throw new EnvValidationError(result.error.issues);
  return result.data;
}

/** Validates the server environment. Throws EnvValidationError so the process fails at startup. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source === process.env) loadDotEnvFile();
  return parseWith(envSchema, source);
}

/** Validates only what the seed needs, so it can run without the Twelve Data key or JWT secret. */
export function loadSeedEnv(source: NodeJS.ProcessEnv = process.env): SeedEnv {
  if (source === process.env) loadDotEnvFile();
  const env = parseWith(seedEnvSchema, source);
  if (!env.DEMO_USER_PASSWORD) {
    throw new Error(
      'DEMO_USER_PASSWORD is not set. Add it to apps/api/.env (8 to 72 bytes) before running the seed.',
    );
  }
  return { ...env, DEMO_USER_PASSWORD: env.DEMO_USER_PASSWORD };
}
