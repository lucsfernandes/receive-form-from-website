import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit cookie CSRF check.
 *
 * Pairs with SameSite=Strict (or Lax in dev) on the session cookie. A
 * cross-site request will be blocked at the SameSite layer first; this
 * is the second line of defense for browsers that botch SameSite or for
 * extension-driven shenanigans.
 *
 * Skipped for safe methods (CSRF only matters for state-changing ones)
 * and for service-account callers that present the static bearer token.
 */
export function requireCsrf(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method)) return next();

  // Service accounts authenticate via Authorization header, which is not
  // attached cross-origin without explicit code — CSRF doesn't apply.
  // Only bypass when the bearer value actually matches ADMIN_STATIC_TOKEN
  // (constant-time). Any bearer would otherwise be a CSRF bypass primitive.
  if (env.adminStaticToken) {
    const authHeader = req.header('authorization') ?? '';
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (m) {
      const provided = Buffer.from(m[1], 'utf8');
      const expected = Buffer.from(env.adminStaticToken, 'utf8');
      if (
        provided.length === expected.length &&
        timingSafeEqual(provided, expected)
      ) {
        return next();
      }
    }
  }

  const headerToken = req.header('x-csrf-token') ?? '';
  const cookieToken = req.cookies?.[env.auth.csrfCookieName] ?? '';

  if (!headerToken || !cookieToken) {
    res.status(403).json({ error: 'Forbidden', message: 'Falha de proteção CSRF' });
    return;
  }

  const a = Buffer.from(headerToken, 'utf8');
  const b = Buffer.from(cookieToken, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(403).json({ error: 'Forbidden', message: 'Falha de proteção CSRF' });
    return;
  }

  next();
}
