import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { AUTH_RATE_LIMITS } from '../src/middleware/rate-limit.js';
import { createTestApp } from './helpers.js';

const credentials = { email: 'jane@example.com', password: 'correct-horse-battery' };
const wrongPassword = { email: credentials.email, password: 'wrong-password' };
const ATTACKER_IP = '203.0.113.10';
const OTHER_IP = '198.51.100.20';
const { limit } = AUTH_RATE_LIMITS.loginFailuresPerEmailAndIp;

describe('login rate limit (failed attempts per email + IP)', () => {
  let app: ReturnType<typeof createTestApp>['app'];

  // With `trust proxy` 1, req.ip is the last X-Forwarded-For entry, as set by Railway or the BFF.
  const loginFrom = (ip: string, body: object) =>
    request(app).post('/auth/login').set('X-Forwarded-For', ip).send(body);

  async function exhaustFailedAttempts(ip: string, body: object): Promise<void> {
    for (let attempt = 0; attempt < limit; attempt += 1) {
      await loginFrom(ip, body).expect(401);
    }
  }

  beforeEach(async () => {
    ({ app } = createTestApp());
    await request(app).post('/auth/register').send(credentials).expect(201);
  });

  it('blocks that email from that IP once the failed attempts are used up', async () => {
    await exhaustFailedAttempts(ATTACKER_IP, wrongPassword);

    // Even the right password is rejected while the window lasts.
    const blocked = await loginFrom(ATTACKER_IP, credentials);

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.retryAfter).toBeGreaterThan(0);
    expect(Number(blocked.headers['retry-after'])).toBe(blocked.body.error.retryAfter);
  });

  it('does not block the same email from another IP', async () => {
    await exhaustFailedAttempts(ATTACKER_IP, wrongPassword);

    const fromOtherIp = await loginFrom(OTHER_IP, credentials);

    expect(fromOtherIp.status).toBe(200);
  });

  it('does not block another email from the same IP', async () => {
    await request(app)
      .post('/auth/register')
      .set('X-Forwarded-For', OTHER_IP)
      .send({ email: 'john@example.com', password: credentials.password })
      .expect(201);
    await exhaustFailedAttempts(ATTACKER_IP, wrongPassword);

    const otherAccount = await loginFrom(ATTACKER_IP, {
      email: 'john@example.com',
      password: credentials.password,
    });

    expect(otherAccount.status).toBe(200);
  });

  it('keys on the normalized email, so changing case or padding does not bypass it', async () => {
    await exhaustFailedAttempts(ATTACKER_IP, wrongPassword);

    const blocked = await loginFrom(ATTACKER_IP, {
      email: '  JANE@Example.com ',
      password: credentials.password,
    });

    expect(blocked.status).toBe(429);
  });

  it('does not count successful logins', async () => {
    for (let attempt = 0; attempt < limit + 2; attempt += 1) {
      await loginFrom(ATTACKER_IP, credentials).expect(200);
    }
  });
});
