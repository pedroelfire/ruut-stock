import 'server-only';
import { z } from 'zod';

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .optional();

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_INTERNAL_URL: z.url({ error: 'API_INTERNAL_URL must be an absolute URL' }),
  SESSION_COOKIE_NAME: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]+$/, { error: 'SESSION_COOKIE_NAME must be a plain cookie name' })
    .default('ruut_session'),
  // Optional: without them only the "Use demo account" button is unavailable.
  DEMO_USER_EMAIL: optionalString,
  DEMO_USER_PASSWORD: optionalString,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * The only place in apps/web that reads process.env. Parsed on every call (it is cheap) instead
 * of at import time, so `next build` does not need runtime secrets and tests can stub variables.
 */
export function getServerEnv(): ServerEnv {
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid server environment: ${details}`);
  }
  return result.data;
}
