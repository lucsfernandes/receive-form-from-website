import { useState, type FormEvent } from 'react';
import { createUser } from '../services/authApi';
import type { ApiFailure } from '../services/api';
import type { AuthUser } from '../types/auth';

interface FormState {
  email: string;
  password: string;
  passwordConfirm: string;
}

const EMPTY: FormState = { email: '', password: '', passwordConfirm: '' };

export default function UsersPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [created, setCreated] = useState<AuthUser | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setFieldErrors({});
    setCreated(null);

    if (form.password !== form.passwordConfirm) {
      setError('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      const user = await createUser({
        email: form.email.trim(),
        password: form.password,
      });
      setCreated(user);
      setForm(EMPTY);
    } catch (err) {
      const failure = err as ApiFailure;
      if (failure.kind === 'validation' && failure.fields) {
        setFieldErrors(failure.fields);
        setError(failure.message);
      } else {
        setError(failure.message ?? 'Falha ao criar usuário');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const update = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Gerenciar administradores
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Cadastre uma nova conta administradora para o painel.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <form onSubmit={handleSubmit} noValidate className="space-y-4 p-6 sm:p-8">
          <div>
            <label
              htmlFor="new-email"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              E-mail
            </label>
            <input
              id="new-email"
              type="email"
              autoComplete="off"
              required
              maxLength={254}
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              aria-invalid={fieldErrors.email ? 'true' : 'false'}
              aria-describedby={fieldErrors.email ? 'email-errors' : undefined}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            {fieldErrors.email ? (
              <ul id="email-errors" className="mt-1.5 text-xs text-rose-700">
                {fieldErrors.email.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="new-password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Senha
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              aria-invalid={fieldErrors.password ? 'true' : 'false'}
              aria-describedby={
                fieldErrors.password ? 'password-errors' : 'password-hint'
              }
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <p id="password-hint" className="mt-1 text-xs text-slate-500">
              Mínimo de 12 caracteres, contendo ao menos uma letra e um dígito.
            </p>
            {fieldErrors.password ? (
              <ul id="password-errors" className="mt-1.5 text-xs text-rose-700">
                {fieldErrors.password.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="new-password-confirm"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Confirmar senha
            </label>
            <input
              id="new-password-confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={form.passwordConfirm}
              onChange={(e) => update('passwordConfirm', e.target.value)}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
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

          {created ? (
            <p
              role="status"
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
            >
              Usuário criado: <strong>{created.email}</strong>
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="submit"
              disabled={
                submitting ||
                !form.email ||
                !form.password ||
                !form.passwordConfirm
              }
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Criando…' : 'Criar administrador'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
