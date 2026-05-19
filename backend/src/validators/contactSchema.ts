import { z } from 'zod';

/**
 * Forbid ASCII control bytes in user-controlled strings.
 * - SINGLE_LINE: NUL..US (0x00..0x1F) and DEL (0x7F) — no whitespace at all.
 * - MULTI_LINE: same set but allows tab (\\t), LF (\\n), CR (\\r) so users
 *   can paste multi-line messages legitimately.
 * Constructed via new RegExp so the literals don't appear as raw bytes in source.
 */
const SINGLE_LINE = new RegExp('^[^\\u0000-\\u001F\\u007F]*$');
const MULTI_LINE = new RegExp('^[^\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]*$');

/**
 * Validation rules for the public contact form payload.
 * Mirrors the client-side rules but is the authoritative source.
 */
export const contactSchema = z.object({
  name: z
    .string({ required_error: 'Nome é obrigatório' })
    .trim()
    .min(2, 'Nome deve ter ao menos 2 caracteres')
    .max(120, 'Nome deve ter no máximo 120 caracteres')
    .regex(SINGLE_LINE, 'Nome contém caracteres inválidos'),
  email: z
    .string({ required_error: 'E-mail é obrigatório' })
    .trim()
    .toLowerCase()
    .email('E-mail inválido')
    .max(254, 'E-mail deve ter no máximo 254 caracteres')
    .regex(SINGLE_LINE, 'E-mail contém caracteres inválidos'),
  subject: z
    .string({ required_error: 'Assunto é obrigatório' })
    .trim()
    .min(2, 'Assunto deve ter ao menos 2 caracteres')
    .max(200, 'Assunto deve ter no máximo 200 caracteres')
    .regex(SINGLE_LINE, 'Assunto contém caracteres inválidos'),
  message: z
    .string({ required_error: 'Mensagem é obrigatória' })
    .trim()
    .min(10, 'Mensagem deve ter ao menos 10 caracteres')
    .max(5000, 'Mensagem deve ter no máximo 5000 caracteres')
    .regex(MULTI_LINE, 'Mensagem contém caracteres inválidos'),
});

export type ContactPayload = z.infer<typeof contactSchema>;

/**
 * Validation rules for the admin list endpoint query string.
 * Coerces strings (from req.query) to numbers and clamps pageSize.
 */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z
    .string()
    .trim()
    .max(200, 'Busca muito longa')
    .regex(SINGLE_LINE, 'Busca contém caracteres inválidos')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/** UUID v4 used as the contact message primary key. */
export const idParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

export type IdParam = z.infer<typeof idParamSchema>;
