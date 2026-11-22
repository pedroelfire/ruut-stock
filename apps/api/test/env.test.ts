import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv, toOrigin } from '../src/config/env.js';

// Passing an explicit source skips the .env file, so the real environment never leaks in.
const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
  CORS_ORIGIN: 'http://localhost:3000',
  TWELVE_DATA_API_KEY: 'test-key',
};

describe('loadEnv', () => {
  it('starts without DEMO_USER_* (they are seed-only)', () => {
    expect(() => loadEnv(baseEnv)).not.toThrow();
    expect(() => loadEnv({ ...baseEnv, DEMO_USER_PASSWORD: 'short' })).not.toThrow();
  });

  it('normalizes CORS_ORIGIN entries to bare origins', () => {
    const env = loadEnv({
      ...baseEnv,
      CORS_ORIGIN: 'http://localhost:3000/ , https://Web.Example.com',
    });

    expect(env.CORS_ORIGIN).toEqual(['http://localhost:3000', 'https://web.example.com']);
  });

  it.each([
    ['a path', 'https://web.example.com/app'],
    ['a query', 'https://web.example.com/?x=1'],
    ['a missing scheme', 'localhost:3000'],
    ['a non-http scheme', 'ftp://web.example.com'],
  ])('rejects a CORS_ORIGIN with %s', (_case, origin) => {
    expect(() => loadEnv({ ...baseEnv, CORS_ORIGIN: origin })).toThrow(EnvValidationError);
  });
});

describe('toOrigin', () => {
  it('keeps the port and drops a lone trailing slash', () => {
    expect(toOrigin('http://localhost:3000/')).toBe('http://localhost:3000');
  });
});
