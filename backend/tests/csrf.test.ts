import { describe, expect, it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { requireCsrf } from '../src/middlewares/csrf';
import { env } from '../src/config/env';

/**
 * Double-submit cookie checks. We pin both the cookie and the header so the
 * comparison is the only thing the middleware can fail on, and exercise
 * - mutating method without header  -> 403
 * - mutating method with mismatched -> 403
 * - mutating method with matching   -> next()
 * - safe method (GET)               -> next() unconditionally
 */
function makeApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.post('/state', requireCsrf, (_req, res) => res.json({ ok: true }));
  app.get('/state', requireCsrf, (_req, res) => res.json({ ok: true }));
  return app;
}

describe('requireCsrf middleware', () => {
  it('passes GET without any token', async () => {
    const res = await request(makeApp()).get('/state');
    expect(res.status).toBe(200);
  });

  it('rejects POST without an X-CSRF-Token header', async () => {
    const res = await request(makeApp())
      .post('/state')
      .set('Cookie', `${env.auth.csrfCookieName}=hello`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('rejects POST when header and cookie disagree', async () => {
    const res = await request(makeApp())
      .post('/state')
      .set('Cookie', `${env.auth.csrfCookieName}=expected`)
      .set('X-CSRF-Token', 'tampered')
      .send({});
    expect(res.status).toBe(403);
  });

  it('passes POST when header and cookie match exactly', async () => {
    const token = 'a-shared-token-value-1234';
    const res = await request(makeApp())
      .post('/state')
      .set('Cookie', `${env.auth.csrfCookieName}=${token}`)
      .set('X-CSRF-Token', token)
      .send({});
    expect(res.status).toBe(200);
  });
});
