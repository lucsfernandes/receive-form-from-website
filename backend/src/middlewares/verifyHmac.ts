import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/**
 * Optional HMAC origin verification for the public POST.
 *
 * When INGEST_HMAC_SECRET is set, requests must include
 *   X-Signature: sha256=<hex hmac of the raw body>
 * The raw body is captured by the JSON parser's verify hook into req.rawBody.
 * When the secret is unset the check is skipped (opt-in hardening).
 */
export function verifyHmac(
  req: Request & { rawBody?: Buffer },
  res: Response,
  next: NextFunction,
): void {
  if (!env.ingestHmacSecret) {
    next();
    return;
  }

  const header = req.header('x-signature') ?? '';
  const match = /^sha256=([0-9a-f]+)$/i.exec(header.trim());
  if (!match) {
    res
      .status(401)
      .json({ error: 'Unauthorized', message: 'Missing or malformed signature' });
    return;
  }

  const provided = Buffer.from(match[1], 'hex');
  const raw = req.rawBody ?? Buffer.alloc(0);
  const expected = createHmac('sha256', env.ingestHmacSecret).update(raw).digest();

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid signature' });
    return;
  }
  next();
}
