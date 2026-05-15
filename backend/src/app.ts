import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { env } from './config/env';
import { logger } from './config/logger';
import contactRoutes from './routes/contactRoutes';
import authRoutes from './routes/authRoutes';
import healthRoutes from './routes/healthRoutes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

/**
 * Builds and returns the Express application.
 * Separated from server bootstrap so it can be reused for testing.
 */
export function createApp(): Express {
  const app = express();

  // Trust the first proxy hop (Traefik / Ingress) for correct req.ip and
  // for express-rate-limit's IP attribution via X-Forwarded-For.
  app.set('trust proxy', 1);

  // Security headers. CSP is left disabled here because the API serves JSON
  // only — CSP belongs on the SPA's nginx config. CORP is set to same-origin
  // when cookies are in play so other origins can't pull the body of a
  // credentialed response into a sandboxed context.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
      // referrerPolicy default is "no-referrer" which is fine for an API.
    }),
  );

  // Request logging + per-request id. pino-http sets x-request-id if missing.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const existing = req.headers['x-request-id'];
        const id =
          typeof existing === 'string' && existing.length > 0
            ? existing
            : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  // CORS allowlist. With cookie-based auth we MUST allow credentials and
  // echo a specific origin (not "*"). Browsers without an Origin header are
  // rejected; server-to-server callers should use the static bearer token.
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, false);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Accept',
        'Authorization',
        'X-Signature',
        'X-CSRF-Token',
        'X-Requested-With',
      ],
      exposedHeaders: ['x-request-id'],
      maxAge: 86400,
    }),
  );

  // Parse cookies so requireAuth / requireCsrf can read them.
  app.use(cookieParser());

  // JSON body parsing. Restrict to application/json, cap payload size,
  // and stash the raw bytes so the HMAC middleware can verify the original.
  app.use(
    express.json({
      limit: '64kb',
      strict: true,
      type: 'application/json',
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = Buffer.from(buf);
      },
    }),
  );

  // Reject malformed JSON with a stable 400 instead of bubbling to the 500 handler.
  app.use(
    (
      err: Error & { type?: string; status?: number },
      req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      if (err && err.type === 'entity.parse.failed') {
        req.log?.warn({ status: 400 }, 'json parse failed');
        res.status(400).json({ error: 'BadJson', message: 'Corpo JSON inválido' });
        return;
      }
      next(err);
    },
  );

  // Public routes
  app.use('/api/v1', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/contact', contactRoutes);

  // Tail-end middlewares
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
