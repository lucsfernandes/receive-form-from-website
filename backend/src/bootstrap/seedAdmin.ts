import { env, isProd } from '../config/env';
import { logger } from '../config/logger';
import { authService } from '../services/authService';

/**
 * Idempotent bootstrap of the first admin user.
 *
 * Triggered on startup, after the DataSource is initialised. Runs only when:
 *   1. ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD are both set, and
 *   2. the users table is empty (so re-runs are no-ops), and
 *   3. either we're not in production, or ADMIN_BOOTSTRAP_ALLOW_PROD=true.
 *
 * In production the safer pattern is:
 *   - run with ADMIN_BOOTSTRAP_ALLOW_PROD=true on the very first deploy,
 *   - then unset the env vars (so future restarts skip this code path),
 *   - and rotate the password from the dashboard.
 */
export async function seedAdminIfEmpty(): Promise<void> {
  const { email, password } = env.bootstrap;
  if (!email || !password) return;

  if (isProd && !env.bootstrap.allowInProd) {
    logger.warn(
      { isProd: true },
      'admin bootstrap requested but ADMIN_BOOTSTRAP_ALLOW_PROD is not set — skipping',
    );
    return;
  }

  if (password.length < 12) {
    logger.error({ reason: 'short_password' }, 'admin bootstrap password is too short — skipping');
    return;
  }

  if (await authService.hasAnyUser()) {
    logger.debug('admin bootstrap skipped: users table is not empty');
    return;
  }

  try {
    const created = await authService.createUser(email, password, 'admin');
    // Do not log the email itself (PII). Just confirm one was created.
    logger.info({ id: created.id, role: created.role }, 'admin bootstrap: created first user');
  } catch (err) {
    logger.error({ err }, 'admin bootstrap failed');
  }
}
