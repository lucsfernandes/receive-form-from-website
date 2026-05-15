import 'reflect-metadata';
import { AppDataSource } from './config/data-source';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { seedAdminIfEmpty } from './bootstrap/seedAdmin';
import { authService } from './services/authService';

const FORCED_EXIT_MS = 25_000;
const DB_INIT_MAX_ATTEMPTS = 8;
const DB_INIT_BACKOFF_BASE_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initDbWithRetry(): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= DB_INIT_MAX_ATTEMPTS; attempt++) {
    try {
      await AppDataSource.initialize();
      logger.info({ attempt }, 'datasource initialised');
      return;
    } catch (err) {
      lastErr = err;
      const wait = DB_INIT_BACKOFF_BASE_MS * 2 ** (attempt - 1);
      logger.warn({ attempt, wait, err }, 'datasource init failed, retrying');
      await sleep(wait);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('datasource init failed');
}

/**
 * Boots the API: initialises the DataSource first so the server only
 * starts accepting traffic once the database is reachable.
 */
async function bootstrap(): Promise<void> {
  try {
    await initDbWithRetry();

    // Best-effort housekeeping; never blocks startup if it fails.
    try {
      await seedAdminIfEmpty();
    } catch (err) {
      logger.warn({ err }, 'admin bootstrap raised');
    }
    try {
      const purged = await authService.purgeExpired();
      if (purged > 0) logger.info({ purged }, 'purged expired refresh tokens');
    } catch (err) {
      logger.warn({ err }, 'refresh-token purge failed');
    }

    // Periodic sweep so long-lived deployments don't accumulate stale rows.
    // The TypeORM query is cheap (B-tree on expires_at) and idempotent, so
    // running it every hour is a no-op when there's nothing to purge.
    const purgeIntervalMs = env.refreshTokenPurgeIntervalMs;
    const purgeTimer = setInterval(() => {
      authService
        .purgeExpired()
        .then((n) => {
          if (n > 0) logger.info({ purged: n }, 'periodic purge: refresh tokens');
        })
        .catch((err) => logger.warn({ err }, 'periodic refresh-token purge failed'));
    }, purgeIntervalMs);
    // Don't let the timer keep the process alive on its own.
    purgeTimer.unref();

    const app = createApp();
    const server = app.listen(env.port, () => {
      logger.info(
        { port: env.port, nodeEnv: env.nodeEnv, purgeIntervalMs },
        'receive-forms-api listening',
      );
    });

    const shutdown = async (signal: string): Promise<void> => {
      logger.info({ signal }, 'shutting down gracefully');
      // Stop the housekeeping loop first so we don't issue a DB query mid-drain.
      clearInterval(purgeTimer);

      // Force-exit guard: if connections refuse to drain we still want to die.
      const killer = setTimeout(() => {
        logger.error({ ms: FORCED_EXIT_MS }, 'forced exit after grace period');
        process.exit(1);
      }, FORCED_EXIT_MS);
      killer.unref();

      server.close(async () => {
        try {
          if (AppDataSource.isInitialized) await AppDataSource.destroy();
        } catch (err) {
          logger.warn({ err }, 'error destroying datasource');
        } finally {
          clearTimeout(killer);
          process.exit(0);
        }
      });
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  } catch (err) {
    logger.fatal({ err }, 'failed to start application');
    process.exit(1);
  }
}

void bootstrap();
