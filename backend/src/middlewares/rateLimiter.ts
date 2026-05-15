import rateLimit from 'express-rate-limit';

/**
 * Normalise an IP address for use in a rate-limit key. Collapses IPv6
 * addresses to their /64 prefix to prevent attackers with /64 allocations
 * from cycling identities — matches express-rate-limit v7's recommended
 * approach. Leaves IPv4 untouched.
 */
function normaliseIp(ip: string): string {
  if (!ip) return '';
  if (ip.includes(':')) {
    // IPv6 — collapse to /64 (first four groups).
    const groups = ip.split(':');
    return groups.slice(0, 4).join(':');
  }
  return ip;
}

/**
 * Public POST limiter: 5 requests per IP per minute.
 * Honors X-Forwarded-For because `app.set('trust proxy', 1)` is on.
 */
export const publicPostLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'TooManyRequests', message: 'Muitas tentativas. Tente novamente em instantes.' },
});

/**
 * Login limiter: 5 attempts per minute per (IP, email) pair.
 *
 * Pairing on the email prevents one noisy box from locking out every account,
 * while still throttling credential-stuffing where attackers cycle emails.
 * The email is taken from the request body if present; falls back to IP-only.
 *
 * Successful logins don't count against the bucket (skipSuccessfulRequests).
 */
export const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // ipKeyGenerator handles IPv6 collapsing properly (required by v7).
  keyGenerator: (req) => {
    const ip = normaliseIp(req.ip ?? '');
    const rawEmail = (req.body as { email?: unknown } | undefined)?.email;
    const email =
      typeof rawEmail === 'string' ? rawEmail.toLowerCase().slice(0, 254) : '';
    return `${ip}|${email}`;
  },
  message: {
    error: 'TooManyRequests',
    message: 'Muitas tentativas de login. Tente novamente em instantes.',
  },
});

/**
 * Refresh limiter: 30/min per IP. Generous enough for legitimate browsers
 * that may refresh on tab focus, tight enough to throttle replay floods.
 */
export const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'TooManyRequests', message: 'Muitas requisições. Tente novamente em instantes.' },
});

/**
 * Forgot-password limiter: 3 per hour per IP.
 *
 * Tight because email-bomb / enumeration attempts via this endpoint are
 * the realistic abuse vector — legitimate users rarely click "forgot" more
 * than once or twice an hour. The endpoint is also always-204 so attackers
 * can't read success/fail signal back, but rate-limiting still matters to
 * shed load on the argon hash + DB writes.
 */
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1h
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Don't reveal "this email is being throttled" — return the same 204 shape
  // we use on success. With express-rate-limit v7 a custom handler is the
  // simplest way to skip the JSON body.
  handler: (_req, res) => {
    res.status(429).end();
  },
});

/**
 * Reset-password limiter: 5/min per IP. The endpoint also verifies the
 * cryptographic token, so this is just to shed brute-force load.
 */
export const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'TooManyRequests', message: 'Muitas tentativas. Tente novamente em instantes.' },
});

/**
 * Self-service password-change limiter: 5/min per IP. The user is already
 * authenticated here so the realistic abuse is "guess the current password"
 * by trying many in a row — argon2 + this limiter together make that very
 * uncomfortable.
 */
export const changePasswordLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'TooManyRequests', message: 'Muitas tentativas. Tente novamente em instantes.' },
});
