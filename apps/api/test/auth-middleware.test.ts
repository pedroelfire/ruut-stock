import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { signAccessToken } from '../src/lib/jwt.js';
import { createTestApp, InMemoryUserRepository, TEST_JWT_SECRET } from './helpers.js';

const user = { id: 'user-1', email: 'jane@example.com', passwordHash: 'unused' };

function expectUnauthorized(response: request.Response): void {
  expect(response.status).toBe(401);
  expect(response.body).toEqual({
    error: { code: 'UNAUTHORIZED', message: expect.any(String) },
  });
}

describe('auth middleware (GET /auth/me)', () => {
  let app: ReturnType<typeof createTestApp>['app'];

  beforeEach(() => {
    const repository = new InMemoryUserRepository();
    repository.users.set(user.id, user);
    ({ app } = createTestApp(repository));
  });

  it('accepts a valid HS256 token and exposes the user', async () => {
    const token = signAccessToken(
      { sub: user.id, email: user.email },
      { secret: TEST_JWT_SECRET, expiresInSeconds: 60 },
    );

    const response = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { user: { id: user.id, email: user.email } } });
  });

  it('rejects a request without Authorization header', async () => {
    expectUnauthorized(await request(app).get('/auth/me'));
  });

  it.each([
    ['a non-Bearer scheme', 'Basic dXNlcjpwYXNz'],
    ['a Bearer header without token', 'Bearer '],
    ['a token that is not a JWT', 'Bearer not-a-jwt'],
    ['a JWT with garbage segments', 'Bearer aaa.bbb.ccc'],
  ])('rejects a malformed header: %s', async (_case, header) => {
    expectUnauthorized(await request(app).get('/auth/me').set('Authorization', header));
  });

  it('rejects an expired token', async () => {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      { sub: user.id, email: user.email, iat: nowInSeconds - 120, exp: nowInSeconds - 60 },
      TEST_JWT_SECRET,
      { algorithm: 'HS256' },
    );

    expectUnauthorized(await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`));
  });

  it('rejects a correctly signed token without exp (it would never expire)', async () => {
    const token = jwt.sign({ sub: user.id, email: user.email }, TEST_JWT_SECRET, {
      algorithm: 'HS256',
    });

    expectUnauthorized(await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`));
  });

  it('rejects a token signed with another secret', async () => {
    const token = signAccessToken(
      { sub: user.id, email: user.email },
      { secret: 'another-secret-that-is-also-at-least-32-chars', expiresInSeconds: 60 },
    );

    expectUnauthorized(await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`));
  });

  it('rejects a token signed with an algorithm other than HS256', async () => {
    // Same secret, valid signature, but HS512: only HS256 is accepted.
    const token = jwt.sign({ sub: user.id, email: user.email }, TEST_JWT_SECRET, {
      algorithm: 'HS512',
      expiresIn: 60,
    });

    expectUnauthorized(await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`));
  });

  it('rejects an unsigned token (alg: none)', async () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: user.id, email: user.email, exp })}.`;

    expectUnauthorized(await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`));
  });
});
