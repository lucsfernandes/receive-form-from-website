import 'dotenv/config';
import { randomBytes } from 'node:crypto';

/**
 * Centralised, validated configuration loaded from environment variables.
 * Keeping this in one place makes it easy to spot missing settings on boot.
 */
function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function toBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function toInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

// JWT signing keys.
//
// Two configuration shapes are supported, in priority order:
//
//   1. AUTH_JWT_KEYS — JSON array of `{ kid, secret, active }` objects. Use
//      this when you need to rotate live (publish a new key as `active: true`
//      while keeping the previous `active: false` around so still-valid
//      access tokens minted with the old kid keep verifying).
//
//   2. AUTH_JWT_SECRET — legacy single-key mode. We treat it as `kid="default"`
//      and use it for both signing and verification. This is the path a
//      fresh clone falls into without any rotation config.
//
// Why a kid: putting an explicit key id in the JWT header makes verification
// O(1) — we read `header.kid`, look up the matching secret, and reject if
// the kid isn't on the allow-list. Without it, multi-key verification would
// need to try every key.
interface JwtKey {
  kid: string;
  secret: string;
  active: boolean;
}

function parseJwtKeysJson(raw: string): JwtKey[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`AUTH_JWT_KEYS is not valid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('AUTH_JWT_KEYS must be a non-empty JSON array');
  }
  const out: JwtKey[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (!item || typeof item !== 'object') {
      throw new Error('AUTH_JWT_KEYS entries must be objects');
    }
    const obj = item as { kid?: unknown; secret?: unknown; active?: unknown };
    if (typeof obj.kid !== 'string' || obj.kid.length === 0 || obj.kid.length > 64) {
      throw new Error('AUTH_JWT_KEYS entries require a non-empty `kid` (<=64 chars)');
    }
    if (!/^[A-Za-z0-9_-]+$/.test(obj.kid)) {
      throw new Error(`AUTH_JWT_KEYS kid "${obj.kid}" contains disallowed characters`);
    }
    if (typeof obj.secret !== 'string' || obj.secret.length < 32) {
      throw new Error(
        `AUTH_JWT_KEYS entry for kid "${obj.kid}" needs a secret of at least 32 chars`,
      );
    }
    if (seen.has(obj.kid)) {
      throw new Error(`AUTH_JWT_KEYS contains duplicate kid "${obj.kid}"`);
    }
    seen.add(obj.kid);
    out.push({ kid: obj.kid, secret: obj.secret, active: obj.active === true });
  }
  const activeCount = out.filter((k) => k.active).length;
  if (activeCount === 0) {
    throw new Error('AUTH_JWT_KEYS must mark exactly one key as active:true');
  }
  if (activeCount > 1) {
    throw new Error('AUTH_JWT_KEYS must mark only one key as active:true');
  }
  return out;
}

const rawKeysJson = process.env.AUTH_JWT_KEYS?.trim() ?? '';
let jwtKeys: JwtKey[];
if (rawKeysJson) {
  jwtKeys = parseJwtKeysJson(rawKeysJson);
} else {
  let authJwtSecret = process.env.AUTH_JWT_SECRET ?? '';
  if (!authJwtSecret) {
    if (isProduction) {
      throw new Error(
        'Missing required environment variable: AUTH_JWT_SECRET (or AUTH_JWT_KEYS)',
      );
    }
    authJwtSecret = randomBytes(48).toString('hex');
    // eslint-disable-next-line no-console
    console.warn(
      '[env] AUTH_JWT_SECRET is unset — generated an ephemeral one for dev. ' +
        'Set AUTH_JWT_SECRET in .env to keep sessions across restarts.',
    );
  }
  if (authJwtSecret.length < 32) {
    throw new Error('AUTH_JWT_SECRET must be at least 32 characters');
  }
  jwtKeys = [{ kid: 'default', secret: authJwtSecret, active: true }];
}

const activeJwtKey = jwtKeys.find((k) => k.active);
if (!activeJwtKey) {
  // parseJwtKeysJson enforces this, but TS doesn't know — narrow for callers.
  throw new Error('No active JWT signing key configured');
}

// Legacy static admin token. Kept for server-to-server callers (cron jobs,
// scripts) that don't go through the login flow. Off by default — when unset
// the middleware short-circuits and rejects, so it stays opt-in.
const adminStaticToken = process.env.ADMIN_STATIC_TOKEN ?? '';

const ingestHmacSecret = process.env.INGEST_HMAC_SECRET ?? '';

const allowedLogLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
type LogLevel = (typeof allowedLogLevels)[number];
const rawLogLevel = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
const logLevel: LogLevel = (allowedLogLevels as readonly string[]).includes(rawLogLevel)
  ? (rawLogLevel as LogLevel)
  : 'info';

// SameSite=Strict by default in production for the strictest CSRF posture.
// In dev we drop to Lax because cross-port flows (5173 -> 3000) on the same
// site count as same-site only when SameSite=Lax/None.
const cookieSameSiteRaw = (process.env.AUTH_COOKIE_SAMESITE ?? (isProduction ? 'strict' : 'lax')).toLowerCase();
const cookieSameSite: 'strict' | 'lax' | 'none' =
  cookieSameSiteRaw === 'none'
    ? 'none'
    : cookieSameSiteRaw === 'lax'
      ? 'lax'
      : 'strict';

// Secure flag. Always true in production. Tunable in dev so localhost (HTTP)
// browsers can still receive the cookie.
const cookieSecure = isProduction ? true : toBool(process.env.AUTH_COOKIE_SECURE, false);

export const env = {
  nodeEnv,
  port: Number(process.env.PORT ?? 3000),

  // Comma-separated list to support multiple origins (e.g. local + prod domain)
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // Optional legacy static bearer token. Kept off by default.
  adminStaticToken,

  // Optional HMAC secret to verify the public POST origin. When unset, the
  // HMAC check is skipped (opt-in hardening).
  ingestHmacSecret,

  logLevel,

  db: {
    host: required('DB_HOST', 'localhost'),
    port: Number(process.env.DB_PORT ?? 5432),
    username: required('DB_USER', 'postgres'),
    password: required('DB_PASSWORD', 'postgres'),
    database: required('DB_NAME', 'receive_forms'),
    synchronize: toBool(process.env.DB_SYNCHRONIZE, false),
    ssl: toBool(process.env.DB_SSL, false),
    logging: toBool(process.env.DB_LOGGING, false),
  },

  auth: {
    // JWT signing keys, with one marked active. Sign with the active one;
    // verify by looking up the header.kid against the map.
    jwtKeys,
    jwtKeysByKid: new Map(jwtKeys.map((k) => [k.kid, k])),
    activeJwtKey,
    // Access-token TTL — short on purpose; refresh rotation handles longevity.
    accessTtlSeconds: toInt(process.env.AUTH_ACCESS_TTL_SECONDS, 15 * 60), // 15m
    // Refresh-token TTL.
    refreshTtlSeconds: toInt(process.env.AUTH_REFRESH_TTL_SECONDS, 7 * 24 * 60 * 60), // 7d
    cookieName: process.env.AUTH_COOKIE_NAME ?? 'rf_session',
    refreshCookieName: process.env.AUTH_REFRESH_COOKIE_NAME ?? 'rf_refresh',
    csrfCookieName: process.env.AUTH_CSRF_COOKIE_NAME ?? 'rf_csrf',
    cookieSameSite,
    cookieSecure,
    // Argon2id parameters — memCost in KiB. Defaults are tuned for a 1 vCPU /
    // 256 Mi pod; bump on bigger nodes. 19 MiB / t=2 / p=1 is the current
    // OWASP cheat-sheet baseline.
    argonMemoryKiB: toInt(process.env.AUTH_ARGON_MEM_KIB, 19_456),
    argonTimeCost: toInt(process.env.AUTH_ARGON_TIME_COST, 2),
    argonParallelism: toInt(process.env.AUTH_ARGON_PARALLELISM, 1),

    // Password reset token TTL (seconds). 1h matches OWASP cheat-sheet guidance.
    passwordResetTtlSeconds: toInt(process.env.AUTH_PASSWORD_RESET_TTL_SECONDS, 60 * 60),

    // Public URL the reset email links to. The token is appended as ?token=...
    // In dev we just log the link to stdout; in prod the email provider plugs in.
    passwordResetBaseUrl:
      process.env.AUTH_PASSWORD_RESET_URL?.trim() || 'http://localhost:5173/reset-password',
  },

  // How often the housekeeping job sweeps expired refresh tokens. Default 1h.
  // Tunable so tests / staging can dial it down.
  refreshTokenPurgeIntervalMs: toInt(
    process.env.REFRESH_TOKEN_PURGE_INTERVAL_MS,
    60 * 60 * 1000,
  ),

  bootstrap: {
    email: process.env.ADMIN_BOOTSTRAP_EMAIL ?? '',
    password: process.env.ADMIN_BOOTSTRAP_PASSWORD ?? '',
    allowInProd: toBool(process.env.ADMIN_BOOTSTRAP_ALLOW_PROD, false),
  },
} as const;

export const isProd = isProduction;
