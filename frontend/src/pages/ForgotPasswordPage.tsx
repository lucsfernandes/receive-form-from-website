import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../services/authApi';
import type { ApiFailure } from '../services/api';

/**
 * "Esqueci minha senha" — the entrance to the reset flow.
 *
 * The server always replies 204 to defeat enumeration; the UI mirrors that
 * by showing the same "if the email exists, instructions were sent" message
 * regardless of whether the address is on file. The only failure surface we
 * differentiate is a true network outage, which we surface so users don't
 * sit waiting on a one-shot promise that never resolved.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setSubmitted(true);
    } catch (err) {
      const failure = err as ApiFailure;
      setError(failure?.message ?? 'Falha ao solicitar redefinição. Tente novamente.');
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
            Redefinir senha
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Informe seu e-mail e enviaremos instruções para redefinir a senha.
          </p>
        </div>

        {submitted ? (
          <div className="space-y-4">
            <p
              role="status"
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
            >
              Se o e-mail informado estiver cadastrado, enviamos as instruções
              para redefinir sua senha. Verifique sua caixa de entrada.
            </p>
            <Link
              to="/login"
              className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
            >
              Voltar para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error ? 'true' : 'false'}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                placeholder="voce@exemplo.com"
              />
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
              disabled={submitting || !email}
              className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Enviando…' : 'Enviar instruções'}
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
        )}
      </div>
    </div>
  );
}
