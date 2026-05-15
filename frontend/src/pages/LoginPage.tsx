import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { ApiFailure } from '../services/api';

function isSafeNext(next: string | null): boolean {
  if (!next) return false;
  // Only accept same-origin paths to defang open-redirect via ?next=https://evil.
  return next.startsWith('/') && !next.startsWith('//');
}

export default function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const rawNext = search.get('next');
  const next = isSafeNext(rawNext) ? rawNext! : '/';
  // `?reset=ok` is appended by ResetPasswordPage after a successful flow so
  // we can show a one-shot confirmation toast on the login screen.
  const resetOk = search.get('reset') === 'ok';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus the first field for keyboard users.
    emailRef.current?.focus();
  }, []);

  if (status === 'authenticated') {
    return <Navigate to={next} replace />;
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      const failure = err as ApiFailure;
      // Generic message — never echo whether the email exists.
      setError(failure?.message ?? 'Não foi possível entrar. Verifique suas credenciais.');
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
            Acesso administrativo
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Entre com sua conta para acessar o painel.
          </p>
        </div>

        {resetOk ? (
          <p
            role="status"
            className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          >
            Sua senha foi atualizada. Faça login com a nova senha.
          </p>
        ) : null}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              E-mail
            </label>
            <input
              ref={emailRef}
              id="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? 'login-error' : undefined}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              placeholder="voce@exemplo.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? 'login-error' : undefined}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <p
              id="login-error"
              role="alert"
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>

          <p className="text-center text-xs text-slate-500">
            <Link
              to="/forgot-password"
              className="underline decoration-dotted underline-offset-2 hover:text-slate-700"
            >
              Esqueci minha senha
            </Link>
          </p>
        </form>
      </div>

      <p className="mt-4 text-center text-xs text-slate-500">
        Acesso restrito. Tentativas são monitoradas.
      </p>
    </div>
  );
}
