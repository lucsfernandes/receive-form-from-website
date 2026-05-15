import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { changeOwnPassword } from '../services/authApi';
import type { ApiFailure } from '../services/api';

interface FormState {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

const EMPTY: FormState = {
  currentPassword: '',
  newPassword: '',
  confirmNewPassword: '',
};

/**
 * Self-service password change.
 *
 * The "current password incorrect" case surfaces as a deliberately vague
 * message — the backend returns a typed 401 we map to that copy here, while
 * never echoing back the typed-in password or revealing per-field detail
 * that could help a shoulder-surfing attacker.
 */
export default function AccountPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [success, setSuccess] = useState<string | null>(null);

  const update = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setFieldErrors({});
    setSuccess(null);

    if (form.newPassword !== form.confirmNewPassword) {
      setFieldErrors({ confirmNewPassword: ['As senhas não coincidem.'] });
      return;
    }
    if (form.currentPassword === form.newPassword) {
      setFieldErrors({ newPassword: ['A nova senha deve ser diferente da atual.'] });
      return;
    }

    setSubmitting(true);
    try {
      await changeOwnPassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setForm(EMPTY);
      setSuccess('Senha alterada com sucesso.');
      // Redirect to the home page after a short pause so the user sees the toast.
      window.setTimeout(() => navigate('/', { replace: true }), 1200);
    } catch (err) {
      const failure = err as ApiFailure;
      if (failure.kind === 'validation' && failure.fields) {
        setFieldErrors(failure.fields);
        setError(failure.message);
      } else if (failure.status === 401) {
        // Backend uses 401 for both "no session" and "wrong current password".
        // The interceptor would have triggered a silent refresh for the former
        // and bounced to /login if it really was an auth failure — so by the
        // time we land here it's overwhelmingly the wrong-password case.
        setError('Senha atual incorreta.');
      } else {
        setError(failure.message ?? 'Falha ao alterar a senha.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Minha conta
        </h1>
        {user ? (
          <p className="mt-1 text-sm text-slate-600">
            Conectado como <strong>{user.email}</strong>.
          </p>
        ) : null}
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4 sm:px-8">
          <h2 className="text-base font-semibold text-slate-900">Alterar senha</h2>
          <p className="mt-1 text-xs text-slate-500">
            Suas outras sessões serão encerradas; você continuará conectado
            apenas neste navegador.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4 p-6 sm:p-8">
          <div>
            <label
              htmlFor="current-password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Senha atual
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={form.currentPassword}
              onChange={(e) => update('currentPassword', e.target.value)}
              aria-invalid={fieldErrors.currentPassword ? 'true' : 'false'}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>

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
              aria-invalid={fieldErrors.newPassword ? 'true' : 'false'}
              aria-describedby={
                fieldErrors.newPassword ? 'new-password-errors' : 'new-password-hint'
              }
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <p id="new-password-hint" className="mt-1 text-xs text-slate-500">
              Mínimo de 12 caracteres, contendo ao menos uma letra e um dígito.
            </p>
            {fieldErrors.newPassword ? (
              <ul id="new-password-errors" className="mt-1.5 text-xs text-rose-700">
                {fieldErrors.newPassword.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="confirm-new-password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Confirmar nova senha
            </label>
            <input
              id="confirm-new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={form.confirmNewPassword}
              onChange={(e) => update('confirmNewPassword', e.target.value)}
              aria-invalid={fieldErrors.confirmNewPassword ? 'true' : 'false'}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            {fieldErrors.confirmNewPassword ? (
              <ul className="mt-1.5 text-xs text-rose-700">
                {fieldErrors.confirmNewPassword.map((m) => (
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

          {success ? (
            <p
              role="status"
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
            >
              {success}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="submit"
              disabled={
                submitting ||
                !form.currentPassword ||
                !form.newPassword ||
                !form.confirmNewPassword
              }
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Salvando…' : 'Alterar senha'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
