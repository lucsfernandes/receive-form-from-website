import { Router } from 'express';
import {
  createContact,
  getContact,
  listContacts,
} from '../controllers/contactController';
import { requireAuth } from '../middlewares/requireAuth';
import { publicPostLimiter } from '../middlewares/rateLimiter';
import { verifyHmac } from '../middlewares/verifyHmac';

const router = Router();

// Admin-only reads: requires an authenticated session (cookie JWT) or, for
// service-to-service callers, a static bearer token via ADMIN_STATIC_TOKEN.
router.get('/', requireAuth, listContacts);
router.get('/:id', requireAuth, getContact);

// Public ingestion: rate-limited + optional HMAC origin check.
router.post('/', publicPostLimiter, verifyHmac, createContact);

export default router;
