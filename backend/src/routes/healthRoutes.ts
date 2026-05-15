import { Router } from 'express';
import { AppDataSource } from '../config/data-source';
import { logger } from '../config/logger';

const router = Router();

/**
 * Liveness probe: process is up. Cheap and dependency-free.
 */
router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Readiness probe: actually checks that the DB is reachable.
 * Kubernetes uses this to decide whether to send traffic.
 * On failure we expose only `status` — DB errors stay in the log.
 */
router.get('/ready', async (_req, res) => {
  try {
    if (!AppDataSource.isInitialized) {
      res.status(503).json({ status: 'not-ready' });
      return;
    }
    await AppDataSource.query('SELECT 1');
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    logger.warn({ err }, 'readiness check failed');
    res.status(503).json({ status: 'not-ready' });
  }
});

export default router;
