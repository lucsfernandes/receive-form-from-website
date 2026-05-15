import { z } from 'zod';

/**
 * Forbid ASCII control bytes in user-controlled strings (single-line variant).
 * Same rule as contactSchema's SINGLE_LINE — kept inline so the two stay
 * independent (auth changes shouldn't be coupled to contact-form rules).
 */
const SINGLE_LINE = new RegExp('^[^\\u0000-\\u001F\\u007F]*$');

/**
 * Password policy:
 *  - 12-128 chars (cap prevents argon2-DoS via giant inputs)
 *  - must contain at least one letter and one digit (light-touch complexity)
 *  - no control characters
 *
 * Rationale: NIST 800-63B leans on length over arbitrary character classes,
 * but for an admin dashboard with very few users the small extra friction
 * of "letter + digit" is worth it as a soft floor without going full
 * "1 upper + 1 lower + 1 symbol" theatrics.
 */
const passwordSchema = z
  .string({ required_error: 'Senha é obrigatória' })
  .min(12, 'Senha deve ter ao menos 12 caracteres')
  .max(128, 'Senha deve ter no máximo 128 caracteres')
  .regex(SINGLE_LINE, 'Senha contém caracteres inválidos')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
    message: 'Senha deve conter ao menos uma letra e um dígito',
  });

const emailSchema = z
  .string({ required_error: 'E-mail é obrigatório' })
  .trim()
  .toLowerCase()
  .email('E-mail inválido')
  .max(254, 'E-mail deve ter no máximo 254 caracteres')
  .regex(SINGLE_LINE, 'E-mail contém caracteres inválidos');

export const loginSchema = z.object({
  email: emailSchema,
  // Login accepts a shorter password too — we still gate by hash, and we don't
  // want to leak the policy in error messages. But cap at 128 to bound work.
  password: z
    .string({ required_error: 'Senha é obrigatória' })
    .min(1, 'Senha é obrigatória')
    .max(128, 'Senha muito longa'),
});

export type LoginPayload = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  // Role is optional and defaults to admin; the controller may still ignore it
  // depending on the caller's privileges. Kept here for forward compatibility.
  role: z.enum(['admin']).optional().default('admin'),
});

export type CreateUserPayload = z.infer<typeof createUserSchema>;

/**
 * Self-service password change. The current password keeps the cheap login
 * validation (length cap only) — we don't want to fail strong-policy checks
 * against a hash that was already accepted under earlier rules.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: 'Senha atual é obrigatória' })
      .min(1, 'Senha atual é obrigatória')
      .max(128, 'Senha atual muito longa'),
    newPassword: passwordSchema,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    path: ['newPassword'],
    message: 'Nova senha deve ser diferente da atual',
  });

export type ChangePasswordPayload = z.infer<typeof changePasswordSchema>;

/** /api/auth/password/forgot — generic, always 204 on success. */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordPayload = z.infer<typeof forgotPasswordSchema>;

/**
 * /api/auth/password/reset — token + new password.
 * Token is the raw hex string the user got via email (64 hex chars from the
 * 32 random bytes the server generated). We keep the regex relaxed so a
 * change of token format down the line doesn't require schema edits.
 */
export const resetPasswordSchema = z.object({
  token: z
    .string({ required_error: 'Token é obrigatório' })
    .min(16, 'Token inválido')
    .max(256, 'Token inválido')
    .regex(/^[A-Za-z0-9_-]+$/, 'Token inválido'),
  newPassword: passwordSchema,
});

export type ResetPasswordPayload = z.infer<typeof resetPasswordSchema>;
