import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import { createApp, type AppConfig } from '../src/app.js';
import {
  DuplicateEmailError,
  type UserRecord,
  type UserRepository,
} from '../src/modules/auth/user.repository.js';

export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

export const testConfig: AppConfig = {
  corsOrigins: ['http://localhost:3000'],
  jwtSecret: TEST_JWT_SECRET,
  jwtExpiresInSeconds: 3600,
};

/** Mirrors the database: unique email, DuplicateEmailError on conflict. */
export class InMemoryUserRepository implements UserRepository {
  readonly users = new Map<string, UserRecord>();

  async findByEmail(email: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async create(input: { email: string; passwordHash: string }): Promise<UserRecord> {
    if (await this.findByEmail(input.email)) throw new DuplicateEmailError();
    const user: UserRecord = { id: randomUUID(), ...input };
    this.users.set(user.id, user);
    return user;
  }
}

export function createTestApp(userRepository: UserRepository = new InMemoryUserRepository()) {
  const app = createApp({
    config: testConfig,
    logger: pino({ level: 'silent' }),
    userRepository,
  });
  return { app, userRepository };
}
