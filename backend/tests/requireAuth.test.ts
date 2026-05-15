import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { installFakeDataSource } from './helpers/fakeDataSource';
import { authService } from '../src/services/authService';
import { requireAuth } from '../src/middlewares/requireAuth';
import { env } from '../src/config/env';

/**
 * Build a tiny app that only exercises requireAuth — keeps the test focused on
 * the middleware's contract and lets us assert it through a real HTTP stack
 * (so we cover cookie parsing, header handling, etc).
 */
function makeApp() {
  const app = express();
  app.use(cookieParser());
  app.get('/protected', requireAuth, (req, res) => {
    res.json({ ok: true, user: req.user });
  });
  return app;
}

describe('requireAuth middleware', () => {
  let teardown: () => void;

  beforeEach(async () => {
    const installed = await installFakeDataSource();
    teardown = installed.uninstall;
  });

  afterEach(() => teardown());

  it('returns 401 when no cookie is present', async () => {
    const res = await request(makeApp()).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorized' });
  });

  it('returns 401 when the cookie holds gibberish', async () => {
    const res = await request(makeApp())
      .get('/protected')
      .set('Cookie', `${env.auth.cookieName}=not-a-real-jwt`);
    expect(res.status).toBe(401);
  });

  it('returns 200 and exposes req.user with a valid session cookie', async () => {
    const user = await authService.createUser('ra@test.com', 'TestPassword123!');
    const persisted = await authService.findByEmail('ra@test.com');
    const session = await authService.issueSession(persisted!);

    const res = await request(makeApp())
      .get('/protected')
      .set('Cookie', `${env.auth.cookieName}=${session.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.email).toBe('ra@test.com');
  });
});
