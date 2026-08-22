import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { setRateLimitEnabled } from '../middleware/rateLimits.js';
import { cleanupUsers } from './helpers/auth.js';

// Limiters are disabled in the test env by default (so createAuthedApi can spam register/login).
// Turn them on for this file only; the in-memory limiter stores live for the file's lifetime, so
// each limiter is exercised exactly once below to avoid cross-test contamination.
const app = createApp();

beforeAll(() => setRateLimitEnabled(true));
afterAll(() => setRateLimitEnabled(false));

beforeEach(async () => {
  await cleanupUsers();
});

describe('rate limiting', () => {
  it('blocks login after 10 attempts within the window', async () => {
    let last;
    for (let i = 0; i < 11; i++) {
      last = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrongpassword' });
    }
    expect(last!.status).toBe(429);
    // 429 body matches the app error shape ({ error: '...' }).
    expect(last!.body).toEqual({ error: expect.any(String) });
    expect(last!.headers['ratelimit-limit']).toBeDefined();
  });

  it('blocks registration after 5 attempts within the window', async () => {
    let last;
    for (let i = 0; i < 6; i++) {
      last = await request(app)
        .post('/api/auth/register')
        .send({ email: `reg-${i}@example.com`, password: 'password123' });
    }
    expect(last!.status).toBe(429);
    expect(last!.body).toEqual({ error: expect.any(String) });
  });

  it('blocks public share-link requests after 100 within the window', async () => {
    let last;
    for (let i = 0; i < 101; i++) {
      last = await request(app).get('/api/shared/00000000-0000-4000-8000-000000000000');
    }
    expect(last!.status).toBe(429);
    expect(last!.body).toEqual({ error: expect.any(String) });
  });
});
