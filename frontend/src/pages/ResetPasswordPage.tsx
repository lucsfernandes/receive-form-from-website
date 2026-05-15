import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../services/authApi';
import type { ApiFailure } from '../services/api';

interface FormState {
  newPassword: string;
  confirmPassword: string;
}

const EMPTY: FormState = { newPassword: '', confirmPassword: '' };

/**
 * Lands here from the email link: /reset-password?token=<hex>
 *
 * The token is read from the query string and never persisted client-side.
 * On success we send the user to /login with a `?reset=ok` flag so the login
 * page can show a quick confirmation toast.
 */
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const tokenLooksValid = useMemo(() => /^[A-Za-z0-9_-]{16,256}$/.test(token), [token]);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!tokenLooksValid) {
      setError('Link inválido ou expirado.');
    }
  }, [tokenLooksValid]);

  const update = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting || !tokenLooksValid) return;
    setError(null);
    setFieldErrors({});

    if (form.newPassword !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: ['As senhas não coincidem.'] });
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword({ token, newPassword: form.newPassword });
      navigate('/login?reset=ok', { replace: true });
    } catch (err) {
      const failure = err as ApiFailure;
      if (failure.kind === 'validation' && failure.fields) {
        setFieldErrors(failure.fields);
        setError(failure.message);
      } else {
        setError(failure.message ?? 'Não foi possível redefinir a senha.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-16">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
            receive-forms
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            Definir nova senha
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Escolha uma senha forte para sua conta administrativa.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="new-password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Nova senha
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={form.newPassword}
              onChange={(e) => update('newPassword', e.target.value)}
              disabled={!tokenLooksValid}
              aria-invalid={fieldErrors.newPassword ? 'true' : 'false'}
              aria-describedby={fieldErrors.newPassword ? 'pw-errors' : 'pw-hint'}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:bg-slate-50"
            />
            <p id="pw-hint" className="mt-1 text-xs text-slate-500">
              Mínimo de 12 caracteres, contendo ao menos uma letra e um dígito.
            </p>
            {fieldErrors.newPassword ? (
              <ul id="pw-errors" className="mt-1.5 text-xs text-rose-700">
                {fieldErrors.newPassword.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Confirmar senha
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={form.confirmPassword}
              onChange={(e) => update('confirmPassword', e.target.value)}
              disabled={!tokenLooksValid}
              aria-invalid={fieldErrors.confirmPassword ? 'true' : 'false'}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:bg-slate-50"
            />
            {fieldErrors.confirmPassword ? (
              <ul className="mt-1.5 text-xs text-rose-700">
                {fieldErrors.confirmPassword.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={
              submitting || !tokenLooksValid || !form.newPassword || !form.confirmPassword
            }
            className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Salvando…' : 'Definir nova senha'}
          </button>

          <p className="text-center text-xs text-slate-500">
            <Link
              to="/login"
              className="underline decoration-dotted underline-offset-2 hover:text-slate-700"
            >
              Voltar para o login
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
