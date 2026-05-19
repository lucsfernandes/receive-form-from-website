import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  contactSchema,
  idParamSchema,
  listQuerySchema,
} from '../validators/contactSchema';
import { contactService } from '../services/contactService';
import type { ContactMessage } from '../entities/ContactMessage';

/** Shape returned to the client — never expose internal TypeORM metadata. */
function serialize(m: ContactMessage) {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    subject: m.subject,
    message: m.message,
    createdAt: m.createdAt,
  };
}

function handleZodError(err: ZodError, res: Response): void {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of err.errors) {
    const key = issue.path.join('.') || '_';
    (fieldErrors[key] ||= []).push(issue.message);
  }
  res.status(400).json({
    error: 'ValidationError',
    message: 'Payload inválido',
    fields: fieldErrors,
  });
}

/**
 * Handles POST /api/contact: validates the body, persists the message,
 * and returns a sanitized representation of the saved record.
 */
export async function createContact(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = contactSchema.parse(req.body);
    const saved = await contactService.create(data);
    res.status(201).json(serialize(saved));
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    next(err);
  }
}

/**
 * Handles GET /api/contact: paginated list of submissions, newest-first,
 * with optional case-insensitive search across name/email/message.
 */
export async function listContacts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = listQuerySchema.parse(req.query);
    const result = await contactService.list(query);
    res.json({
      data: result.data.map(serialize),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    });
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    next(err);
  }
}

/**
 * Handles GET /api/contact/:id: fetches a single submission by UUID.
 * 400 if the UUID is malformed, 404 if no record exists for it.
 */
export async function getContact(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const found = await contactService.findById(id);
    if (!found) {
      res.status(404).json({
        error: 'NotFound',
        message: 'Mensagem não encontrada',
      });
      return;
    }
    res.json(serialize(found));
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    next(err);
  }
}
