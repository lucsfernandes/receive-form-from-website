import { pino } from 'pino';
import { env, isProd } from './env';

/**
 * App-wide structured logger. PII and DB internals are stripped via `redact`
 * so we never ship raw user payloads or query parameters to logs/aggregators.
 */
export const logger = pino({
  level: env.logLevel,
  // Pretty output is convenient locally; in prod we emit raw JSON for shippers.
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
        },
      }),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      'req.body.email',
      'req.body.message',
      'req.body.name',
      'req.body.password',
      'req.body.token',
      // Catch-all for accidental leaks in custom log calls.
      '*.password',
      '*.passwordHash',
      '*.password_hash',
      '*.refreshToken',
      '*.accessToken',
      'err.query',
      'err.parameters',
      'err.driverError',
    ],
    remove: true,
  },
});

export type Logger = typeof logger;
