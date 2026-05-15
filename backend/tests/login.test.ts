import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { installFakeDataSource } from './helpers/fakeDataSource';
import { authService } from '../src/services/authService';
import { login } from '../src/controllers/authController';
import { loginLimiter } from '../src/middlewares/rateLimiter';

/**
 * Smoke through the login controller AND the limiter together. We mount only
 * the relevant slice of the app so we don't pull in helmet/CORS/etc.
 *
 * A separate app instance per test avoids cross-test leakage in the limiter's
 * in-memory store.
 */
function makeApp() {
  const app = express();
  // The limiter consults req.ip; trust the supertest IP so multiple requests
  // from supertest hit the same bucket.
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());
  app.post('/login', loginLimiter, login);
  return app;
}

describe('POST /login', () => {
  let teardown: () => void;

  beforeEach(async () => {
    const installed = await installFakeDataSource();
    teardown = installed.uninstall;
  });

  afterEach(() => teardown());

  it('returns a generic 401 with a wrong password (no enumeration)', async () => {
    await authService.createUser('login@test.com', 'GoodPassword123!');
    const res = await request(makeApp())
      .post('/login')
      .send({ email: 'login@test.com', password: 'WrongPassword456!' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Credenciais inválidas');
  });

  it('returns the same generic 401 for an unknown email', async () => {
    const res = await request(makeApp())
      .post('/login')
      .send({ email: 'nobody@test.com', password: 'WhateverPassword1' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Credenciais inválidas');
  });

  it('sets the session cookies on a successful login', async () => {
    await authService.createUser('ok@test.com', 'GoodPassword123!');
    const res = await request(makeApp())
      .post('/login')
      .send({ email: 'ok@test.com', password: 'GoodPassword123!' });

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeTruthy();
    const cookieString = Array.isArray(cookies) ? cookies.join('|') : cookies;
    expect(cookieString).toMatch(/rf_session=/);
    expect(cookieString).toMatch(/rf_refresh=/);
    expect(cookieString).toMatch(/rf_csrf=/);
  });

  it('the 6th failed login is rate-limited', async () => {
    const app = makeApp();
    const send = () =>
      request(app)
        .post('/login')
        .send({ email: 'limit@test.com', password: 'wrong-pwd-not-12-chars-but-acc' });

    // 5 attempts within the window are allowed (and all return 401).
    for (let i = 0; i < 5; i++) {
      const res = await send();
      expect(res.status).toBe(401);
    }
    // The 6th hits the limiter.
    const blocked = await send();
    expect(blocked.status).toBe(429);
  });
});
