import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { authService } from '../services/authService';
import {
  changePasswordSchema,
  createUserSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from '../validators/authSchema';
import { HttpError } from '../errors/HttpError';

/**
 * Cookie attributes shared by every session cookie.
 *
 * - `httpOnly: true`     — JS in the SPA can't read this. Mitigates XSS.
 * - `secure`             — env-driven so localhost (HTTP) still works in dev.
 * - `sameSite`           — strict in prod, lax in dev (cross-port flows).
 * - `path: '/'`          — every API path needs the session cookie.
 *
 * We intentionally do NOT set a Domain attribute: omitting it scopes the
 * cookie to the exact host that set it, which is what we want behind Traefik.
 */
function baseCookieOpts() {
  return {
    httpOnly: true,
    secure: env.auth.cookieSecure,
    sameSite: env.auth.cookieSameSite,
    path: '/',
  } as const;
}

function setSessionCookies(
  res: Response,
  payload: {
    accessToken: string;
    refreshToken: string;
    csrfToken: string;
    refreshExpiresAt: Date;
  },
): void {
  const base = baseCookieOpts();

  // Access cookie: lives as long as the JWT itself. The JWT carries its own
  // expiry; the cookie's maxAge is just there so the browser drops it.
  res.cookie(env.auth.cookieName, payload.accessToken, {
    ...base,
    maxAge: env.auth.accessTtlSeconds * 1000,
  });

  // Refresh cookie: only sent to /api/auth/* (scoped via path). Rotated on use.
  res.cookie(env.auth.refreshCookieName, payload.refreshToken, {
    ...base,
    path: '/api/auth',
    maxAge: env.auth.refreshTtlSeconds * 1000,
  });

  // CSRF cookie: must be readable by JS so the SPA can mirror it in a header.
  // SameSite=Strict in prod still protects it from cross-site reads.
  res.cookie(env.auth.csrfCookieName, payload.csrfToken, {
    ...base,
    httpOnly: false,
    maxAge: env.auth.accessTtlSeconds * 1000,
  });
}

function clearSessionCookies(res: Response): void {
  const base = baseCookieOpts();
  res.clearCookie(env.auth.cookieName, base);
  res.clearCookie(env.auth.refreshCookieName, { ...base, path: '/api/auth' });
  res.clearCookie(env.auth.csrfCookieName, { ...base, httpOnly: false });
}

function handleZodError(err: ZodError, res: Response): void {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of err.errors) {
    const key = issue.path.join('.') || '_';
    (fieldErrors[key] ||= []).push(issue.message);
  }
  res.status(400).json({
    error: 'ValidationError',
    message: 'Payload inválido',
    fields: fieldErrors,
  });
}

/**
 * POST /api/auth/login
 * Generic 401 on any failure mode — never disclose whether the email exists.
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await authService.findByEmail(email);

    // Always do the verify, even when the user doesn't exist, to keep timing
    // roughly constant. We hash against a throwaway argon2id digest so the
    // attacker can't infer existence by latency.
    const hashToCompare =
      user?.passwordHash ??
      '$argon2id$v=19$m=19456,t=2,p=1$bm9ub25vbm9ub25vbm9ubw$cGxhY2Vob2xkZXJwbGFjZWhvbGRlcg';
    const passwordOk = await authService.verifyPassword(hashToCompare, password);

    if (!user || !passwordOk) {
      req.log?.warn({ status: 401, reason: 'login_failed' }, 'login failed');
      res.status(401).json({ error: 'Unauthorized', message: 'Credenciais inválidas' });
      return;
    }

    const session = await authService.issueSession(user);
    setSessionCookies(res, session);

    res.status(200).json({ user: session.user });
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Idempotent — succeeds even if there was no session.
 */
export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const refresh = req.cookies?.[env.auth.refreshCookieName];
    await authService.revokeRefresh(refresh);
    clearSessionCookies(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 * Consumes the current refresh cookie, mints a fresh access+refresh pair.
 * Public-ish: it requires the refresh cookie but no access JWT.
 */
export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawRefresh = req.cookies?.[env.auth.refreshCookieName];
    if (!rawRefresh) {
      throw new HttpError(401, 'Unauthorized', 'Sessão ausente');
    }
    const session = await authService.rotateRefresh(rawRefresh);
    setSessionCookies(res, session);
    res.status(200).json({ user: session.user });
  } catch (err) {
    // Any failure here leaves the client holding cookies that can no longer
    // be refreshed — keeping them around just produces a silent 401 loop.
    // Clear unconditionally so the SPA's interceptor falls through to /login.
    clearSessionCookies(res);
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Returns the user that owns the current session, or 401.
 */
export async function me(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user; // set by requireAuth
    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Sessão ausente' });
      return;
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/users
 * Create a new admin user. Caller must already be an admin (gate is wired
 * by the route, not here).
 */
export async function createUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password, role } = createUserSchema.parse(req.body);
    const created = await authService.createUser(email, password, role);
    res.status(201).json({ user: created });
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    next(err);
  }
}

/**
 * PATCH /api/auth/me/password
 * Self-service password change. Verifies the current password, swaps the
 * hash, and revokes every refresh token of this user EXCEPT the one tied
 * to the cookie that's making the request (so the user stays signed in here
 * but is forced out everywhere else).
 */
export async function changeOwnPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Sessão ausente' });
      return;
    }
    if (user.isServiceAccount) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Service accounts não podem alterar senha',
      });
      return;
    }
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const currentRefresh = req.cookies?.[env.auth.refreshCookieName];
    await authService.changePassword(user.id, currentPassword, newPassword, {
      preserveRefreshToken: currentRefresh,
    });
    res.status(204).end();
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    next(err);
  }
}

/**
 * POST /api/auth/password/forgot
 *
 * Generates a one-shot reset token IF the email maps to a real user. The
 * response is always 204 — leaking the existence of an email is a known
 * enumeration vector and the user-experience cost of being generic is tiny.
 *
 * In dev we log the reset link to stdout. In production this should fan out
 * to an email provider (SES, Postmark, …) via `sendPasswordResetEmail`,
 * which currently still only logs but has a stable signature for a future
 * integration.
 */
export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const issued = await authService.createPasswordResetToken(email);
    if (issued) {
      // Build the URL the email body will eventually point at.
      const url = `${env.auth.passwordResetBaseUrl}?token=${encodeURIComponent(issued.rawToken)}`;
      await sendPasswordResetEmail({
        userId: issued.userId,
        resetUrl: url,
        expiresAt: issued.expiresAt,
      });
    } else {
      // Constant-ish work cost on the "doesn't exist" branch so timing-based
      // enumeration is uncomfortable. We don't sleep; the argon hash on real
      // signups is already the longest leg of the equivalent flow.
      req.log?.warn({ status: 204, reason: 'forgot_password_unknown_email' }, 'forgot password requested for unknown email');
    }
    res.status(204).end();
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    next(err);
  }
}

/**
 * POST /api/auth/password/reset
 * Consumes a reset token, swaps the password, and revokes every active
 * session for the owning user.
 */
export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    await authService.resetPasswordWithToken(token, newPassword);
    // Also clear any cookies that may be lingering on the calling browser —
    // the user is about to be forced to log in fresh.
    clearSessionCookies(res);
    res.status(204).end();
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    next(err);
  }
}

/**
 * Pluggable hook for delivering the reset link. Today it just logs; swap
 * the body for your provider call (SES, Postmark, SendGrid, …) without
 * touching the controller.
 *
 * NOTE: the token is single-use AND expires in 1h — logging it here is
 * acceptable for dev/staging. In production point the implementation at
 * a real email transport and consider stripping the log line entirely.
 */
async function sendPasswordResetEmail(input: {
  userId: string;
  resetUrl: string;
  expiresAt: Date;
}): Promise<void> {
  // TODO(integrations): plug an email provider here. Keep the signature
  // stable — callers only ever know the URL + expiry.
  logger.info(
    {
      userId: input.userId,
      // The URL is the only useful piece in dev; log it explicitly so the
      // operator can copy/paste during local testing.
      resetUrl: input.resetUrl,
      expiresAt: input.expiresAt.toISOString(),
    },
    'password reset link (dev — wire this to an email provider in production)',
  );
}

export { clearSessionCookies, setSessionCookies };
