import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { unauthorized } from './errors.js';

const JWT_ALGORITHM = 'HS256';

export interface AccessTokenClaims {
  sub: string;
  email: string;
}

export interface JwtConfig {
  secret: string;
  expiresInSeconds: number;
}

const claimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().min(1),
  // jsonwebtoken only checks exp when present; a token without it would never expire.
  exp: z.number(),
});

export function signAccessToken(claims: AccessTokenClaims, config: JwtConfig): string {
  return jwt.sign({ email: claims.email }, config.secret, {
    algorithm: JWT_ALGORITHM,
    subject: claims.sub,
    expiresIn: config.expiresInSeconds,
  });
}

/**
 * Throws UNAUTHORIZED for any invalid token: bad signature, expired, malformed, missing claims
 * or an algorithm other than HS256 (pinning the algorithm blocks "alg: none" and key confusion).
 */
export function verifyAccessToken(token: string, secret: string): AccessTokenClaims {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] });
  } catch {
    throw unauthorized('Invalid or expired token');
  }
  const result = claimsSchema.safeParse(decoded);
  if (!result.success) throw unauthorized('Invalid or expired token');
  return { sub: result.data.sub, email: result.data.email };
}
