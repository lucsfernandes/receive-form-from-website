import type { Request, Response, NextFunction } from 'express';
import { QueryFailedError } from 'typeorm';
import { isProd } from '../config/env';
import { HttpError } from '../errors/HttpError';
import { logger } from '../config/logger';

/**
 * Catch-all error middleware. Must keep the 4-argument signature
 * for Express to recognise it as an error handler.
 *
 * Mapping strategy:
 *   - HttpError      -> use the embedded status + code/message
 *   - QueryFailedError with code 23505 (unique violation) -> 409
 *   - everything else -> 500 with a generic message in prod
 */
export function errorHandler(
  err: Error & { status?: number; code?: string },
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const log = (req as Request & { log?: typeof logger }).log ?? logger;

  if (err instanceof HttpError) {
    log.warn({ status: err.status, code: err.code }, 'http error');
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }

  if (err instanceof QueryFailedError) {
    // 23505 = unique_violation. Anything else from the DB layer is opaque to the client.
    const pgCode = (err as QueryFailedError & { code?: string }).code;
    if (pgCode === '23505') {
      log.warn({ pgCode }, 'duplicate key violation');
      res.status(409).json({ error: 'Conflict', message: 'Registro já existe' });
      return;
    }
    log.error({ err }, 'database query failed');
    res.status(500).json({
      error: 'InternalServerError',
      message: 'Erro interno do servidor',
    });
    return;
  }

  log.error({ err }, 'unhandled error');
  const status = err.status ?? 500;
  res.status(status).json({
    error: err.name || 'InternalServerError',
    message: isProd ? 'Erro interno do servidor' : err.message,
  });
}

/**
 * 404 fallback for unknown routes — placed after all real routes.
 */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'NotFound', message: 'Rota não encontrada' });
}
