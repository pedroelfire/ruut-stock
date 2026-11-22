import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';

export interface AuthUser {
  id: string;
  email: string;
}

declare global {
  // Module augmentation of Express' global Request type is the documented way to type req.user.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// The auth scheme is case-insensitive (RFC 7235); whether the token is valid is up to jwt.verify.
const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

/**
 * Rejects with 401 UNAUTHORIZED when the token is missing, malformed, expired, signed with
 * another secret or uses an algorithm other than HS256. On success sets req.user.
 */
export function createAuthMiddleware(jwtSecret: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.get('authorization');
    if (!header) return next(unauthorized('Authentication required'));

    const match = BEARER_PATTERN.exec(header.trim());
    if (!match?.[1]) return next(unauthorized('Invalid or expired token'));

    try {
      const claims = verifyAccessToken(match[1], jwtSecret);
      req.user = { id: claims.sub, email: claims.email };
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** For handlers mounted behind the auth middleware. */
export function requireAuthUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
