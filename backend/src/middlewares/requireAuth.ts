import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { authService } from '../services/authService';
import type { SafeUser } from '../services/authService';
import type { UserRole } from '../entities/User';

// Augment Express's Request so downstream handlers see req.user typed.
declare module 'express-serve-static-core' {
  interface Request {
    user?: SafeUser;
  }
}

/**
 * Authenticate a request based on the access-token cookie.
 *
 * Reads the access JWT from the HttpOnly cookie (set by /auth/login).
 * Also accepts a static bearer token for server-to-server callers when
 * ADMIN_STATIC_TOKEN is configured. Keeps cron jobs and bootstrap scripts
 * working without holding a session.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Cookie-based session is the SPA's only auth path.
  const cookieToken = req.cookies?.[env.auth.cookieName];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    const claims = authService.verifyAccessToken(cookieToken);
    if (claims) {
      const user = await authService.findById(claims.sub);
      if (user) {
        req.user = user;
        return next();
      }
    }
  }

  // Optional static bearer for server-to-server callers (opt-in).
  if (env.adminStaticToken) {
    const header = req.header('authorization') ?? '';
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (m) {
      const provided = Buffer.from(m[1], 'utf8');
      const expected = Buffer.from(env.adminStaticToken, 'utf8');
      if (
        provided.length === expected.length &&
        timingSafeEqual(provided, expected)
      ) {
        // Synthetic admin user — no DB row. The `service:` prefix on `id`
        // makes it impossible to confuse with a real UUID in audit logs.
        req.user = {
          id: 'service:static-token',
          email: 'service-account@local',
          role: 'admin',
          createdAt: new Date(0),
          updatedAt: new Date(0),
          lastLoginAt: null,
          isServiceAccount: true,
        };
        return next();
      }
    }
  }

  res.status(401).json({ error: 'Unauthorized', message: 'Autenticação necessária' });
}

/**
 * Role gate. Use after `requireAuth` so req.user is guaranteed populated.
 */
export function requireRole(role: UserRole) {
  return function roleGate(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Autenticação necessária' });
      return;
    }
    if (req.user.role !== role) {
      res.status(403).json({ error: 'Forbidden', message: 'Permissão insuficiente' });
      return;
    }
    next();
  };
}
