import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt only reads the first 72 bytes and silently ignores the rest, so longer input is rejected. */
export const PASSWORD_MAX_BYTES = 72;
export const EMAIL_MAX_LENGTH = 254;

const utf8Encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).length;
}

/** Trims and lowercases before validating, so " Demo@Example.com " and "demo@example.com" are the same account. */
export const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ error: 'Enter a valid email address' })
      .max(EMAIL_MAX_LENGTH, { error: 'Email is too long' }),
  );

export const passwordSchema = z
  .string({ error: 'Password is required' })
  .min(PASSWORD_MIN_LENGTH, {
    error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  .refine((value) => utf8ByteLength(value) <= PASSWORD_MAX_BYTES, {
    error: `Password must be at most ${PASSWORD_MAX_BYTES} bytes`,
  });

export const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const registerBodySchema = credentialsSchema;
export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = credentialsSchema;
export type LoginBody = z.infer<typeof loginBodySchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const authResultSchema = z.object({
  token: z.string(),
  user: userSchema,
});
export type AuthResult = z.infer<typeof authResultSchema>;

/** Response of POST /auth/register (201) and POST /auth/login (200). */
export const authResponseSchema = z.object({
  data: authResultSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

/** Response of GET /auth/me. */
export const meResponseSchema = z.object({
  data: z.object({ user: userSchema }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
