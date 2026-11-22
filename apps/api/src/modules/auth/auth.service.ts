import type { AuthResult, LoginBody, RegisterBody, User } from '@ruut/shared';
import { conflict, unauthorized } from '../../lib/errors.js';
import { signAccessToken, type JwtConfig } from '../../lib/jwt.js';
import { createDummyPasswordHash, hashPassword, verifyPassword } from '../../lib/password.js';
import { DuplicateEmailError, type UserRecord, type UserRepository } from './user.repository.js';

export interface AuthService {
  register(input: RegisterBody): Promise<AuthResult>;
  login(input: LoginBody): Promise<AuthResult>;
  getCurrentUser(userId: string): Promise<User>;
}

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
const EMAIL_TAKEN_MESSAGE = 'An account with this email already exists';

function toPublicUser(record: UserRecord): User {
  return { id: record.id, email: record.email };
}

/** Inputs arrive already validated and normalized by the shared Zod schemas. */
export function createAuthService(deps: {
  userRepository: UserRepository;
  jwt: JwtConfig;
}): AuthService {
  const { userRepository, jwt } = deps;
  // Started eagerly so the first login with an unknown email does not pay for it.
  const dummyHashPromise = createDummyPasswordHash();

  function issueAuthResult(record: UserRecord): AuthResult {
    const token = signAccessToken({ sub: record.id, email: record.email }, jwt);
    return { token, user: toPublicUser(record) };
  }

  return {
    async register({ email, password }) {
      // Cheap check first so a duplicate does not cost a bcrypt hash.
      if (await userRepository.findByEmail(email)) throw conflict(EMAIL_TAKEN_MESSAGE);

      const passwordHash = await hashPassword(password);
      try {
        const record = await userRepository.create({ email, passwordHash });
        return issueAuthResult(record);
      } catch (error) {
        // Two concurrent registrations can both pass the check above; the unique index decides.
        if (error instanceof DuplicateEmailError) throw conflict(EMAIL_TAKEN_MESSAGE);
        throw error;
      }
    },

    async login({ email, password }) {
      const record = await userRepository.findByEmail(email);
      // Always run bcrypt, even for unknown emails, to avoid a timing side channel.
      const passwordHash = record?.passwordHash ?? (await dummyHashPromise);
      const passwordMatches = await verifyPassword(password, passwordHash);
      if (!record || !passwordMatches) throw unauthorized(INVALID_CREDENTIALS_MESSAGE);
      return issueAuthResult(record);
    },

    async getCurrentUser(userId) {
      const record = await userRepository.findById(userId);
      // A valid token for a deleted user is treated as an invalid session.
      if (!record) throw unauthorized('Invalid or expired token');
      return toPublicUser(record);
    },
  };
}
