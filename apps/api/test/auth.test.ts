import { authResponseSchema, PASSWORD_MAX_BYTES, utf8ByteLength } from '@ruut/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { verifyAccessToken } from '../src/lib/jwt.js';
import { DuplicateEmailError } from '../src/modules/auth/user.repository.js';
import { createTestApp, InMemoryUserRepository, TEST_JWT_SECRET } from './helpers.js';

const credentials = { email: 'jane@example.com', password: 'correct-horse-battery' };

describe('auth endpoints', () => {
  let app: ReturnType<typeof createTestApp>['app'];
  let repository: InMemoryUserRepository;

  beforeEach(() => {
    repository = new InMemoryUserRepository();
    ({ app } = createTestApp(repository));
  });

  describe('POST /auth/register', () => {
    it('creates the user, stores a bcrypt hash and returns a token for it', async () => {
      const response = await request(app).post('/auth/register').send(credentials);

      expect(response.status).toBe(201);
      const { data } = authResponseSchema.parse(response.body);
      expect(data.user.email).toBe(credentials.email);
      expect(verifyAccessToken(data.token, TEST_JWT_SECRET)).toMatchObject({
        sub: data.user.id,
        email: credentials.email,
      });

      const stored = await repository.findByEmail(credentials.email);
      expect(stored?.passwordHash).toMatch(/^\$2[aby]\$10\$/);
      expect(stored?.passwordHash).not.toContain(credentials.password);
    });

    it('returns 409 CONFLICT when the email is already registered', async () => {
      await request(app).post('/auth/register').send(credentials).expect(201);

      const response = await request(app).post('/auth/register').send(credentials);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('returns 409 when a concurrent registration wins the race after the existence check', async () => {
      // findByEmail sees no user, but the unique index rejects the insert (DuplicateEmailError).
      class RacingRepository extends InMemoryUserRepository {
        override async findByEmail(): Promise<null> {
          return null;
        }
        override async create(): Promise<never> {
          throw new DuplicateEmailError();
        }
      }
      const { app: racingApp } = createTestApp(new RacingRepository());

      const response = await request(racingApp).post('/auth/register').send(credentials);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('normalizes the email, so case and spaces do not create a second account', async () => {
      const first = await request(app)
        .post('/auth/register')
        .send({ email: '  Jane@Example.COM ', password: credentials.password });

      expect(first.status).toBe(201);
      expect(first.body.data.user.email).toBe('jane@example.com');

      const duplicate = await request(app).post('/auth/register').send(credentials);
      expect(duplicate.status).toBe(409);
    });

    it('rejects a password over 72 bytes even when it is under 72 characters', async () => {
      // 25 characters, 100 bytes: bcrypt would silently ignore everything after byte 72.
      const multibytePassword = '😀'.repeat(25);
      expect(multibytePassword.length).toBeLessThan(PASSWORD_MAX_BYTES);
      expect(utf8ByteLength(multibytePassword)).toBeGreaterThan(PASSWORD_MAX_BYTES);

      const response = await request(app)
        .post('/auth/register')
        .send({ email: credentials.email, password: multibytePassword });

      expect(response.status).toBe(400);
      expect(response.body.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Password must be at most 72 bytes',
      });
      expect(repository.users.size).toBe(0);
    });

    it('accepts a multibyte password of exactly 72 bytes', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({ email: credentials.email, password: '😀'.repeat(18) });

      expect(response.status).toBe(201);
    });

    it('returns 400 VALIDATION_ERROR for an invalid email', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({ email: 'not-an-email', password: credentials.password });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/auth/register').send(credentials).expect(201);
    });

    it('returns a token for the right password', async () => {
      const response = await request(app).post('/auth/login').send(credentials);

      expect(response.status).toBe(200);
      const { data } = authResponseSchema.parse(response.body);
      expect(data.user.email).toBe(credentials.email);
    });

    it('logs in with a differently cased, padded email', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: ' JANE@example.com', password: credentials.password });

      expect(response.status).toBe(200);
    });

    it('returns 401 with the generic message for a wrong password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: credentials.email, password: 'wrong-password' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
      });
    });

    it('returns the same 401 for an unknown email, so accounts cannot be enumerated', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: credentials.password });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
      });
    });

    it('returns a token that GET /auth/me accepts', async () => {
      const login = await request(app).post('/auth/login').send(credentials);

      const me = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${login.body.data.token}`);

      expect(me.status).toBe(200);
      expect(me.body.data.user.email).toBe(credentials.email);
    });
  });

  describe('error handling', () => {
    it('answers unknown routes with the standard 404 body', async () => {
      const response = await request(app).get('/does-not-exist');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
    });

    it('answers malformed JSON with VALIDATION_ERROR instead of a stack trace', async () => {
      const response = await request(app)
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": ');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: { code: 'VALIDATION_ERROR', message: 'Request body must be valid JSON' },
      });
    });

    it('rejects a JSON body over 10 kb with 400 VALIDATION_ERROR', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({ ...credentials, padding: 'x'.repeat(11 * 1024) });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: { code: 'VALIDATION_ERROR', message: 'Request body is too large' },
      });
    });

    it('maps other exposed body-parser 4xx errors (unsupported charset) to VALIDATION_ERROR', async () => {
      const response = await request(app)
        .post('/auth/login')
        .set('Content-Type', 'application/json; charset=latin1')
        .send(JSON.stringify(credentials));

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: { code: 'VALIDATION_ERROR', message: 'Unsupported request body encoding' },
      });
    });
  });
});
