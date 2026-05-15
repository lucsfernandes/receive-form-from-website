import { Router } from 'express';
import {
  changeOwnPassword,
  createUser,
  forgotPassword,
  login,
  logout,
  me,
  refresh,
  resetPassword,
} from '../controllers/authController';
import { requireAuth, requireRole } from '../middlewares/requireAuth';
import { requireCsrf } from '../middlewares/csrf';
import {
  changePasswordLimiter,
  forgotPasswordLimiter,
  loginLimiter,
  refreshLimiter,
  resetPasswordLimiter,
} from '../middlewares/rateLimiter';

const router = Router();

// Login & refresh — no auth required, but rate-limited.
// CSRF intentionally NOT applied to /login (the client has no CSRF cookie yet)
// nor to /refresh (the refresh cookie itself is SameSite-protected). State
// changes are still gated by SameSite=Strict|Lax + the credential checks.
router.post('/login', loginLimiter, login);
router.post('/refresh', refreshLimiter, refresh);

// Logout — accept either an authenticated session or just the refresh cookie;
// the controller is idempotent. CSRF still required when the user has a session.
router.post('/logout', requireCsrf, logout);

// Forgot-password flow. Both endpoints are public; CSRF is irrelevant because
// the caller has no session cookie yet, but they're tightly rate-limited.
router.post('/password/forgot', forgotPasswordLimiter, forgotPassword);
router.post('/password/reset', resetPasswordLimiter, resetPassword);

// Authenticated routes.
router.get('/me', requireAuth, me);

// Self-service password change. Authenticated + CSRF + rate-limited.
router.patch(
  '/me/password',
  requireAuth,
  requireCsrf,
  changePasswordLimiter,
  changeOwnPassword,
);

// Admin-only user creation. requireAuth populates req.user; requireRole gates;
// requireCsrf protects against cross-site POST.
router.post(
  '/users',
  requireAuth,
  requireRole('admin'),
  requireCsrf,
  createUser,
);

export default router;
