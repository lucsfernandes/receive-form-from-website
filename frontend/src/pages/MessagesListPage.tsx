import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useMessageList } from '../hooks/useMessages';
import type { ContactMessage } from '../types/contact';
import { formatDateTime, preview, relativeTime } from '../utils/time';

const PAGE_SIZE = 20;

function parseIntSafe(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default function MessagesListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialQ = searchParams.get('q') ?? '';
  const page = parseIntSafe(searchParams.get('page'), 1);

  const [queryInput, setQueryInput] = useState(initialQ);
  const debouncedQuery = useDebouncedValue(queryInput, 300);

  // Push the debounced search term into the URL so it's bookmarkable and
  // reset to page 1 whenever the query changes. The functional setter avoids
  // needing searchParams in the dependency array (which would re-run the
  // effect after every URL update we ourselves trigger).
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debouncedQuery) next.set('q', debouncedQuery);
        else next.delete('q');
        if (debouncedQuery !== (prev.get('q') ?? '')) next.delete('page');
        return next;
      },
      { replace: true },
    );
  }, [debouncedQuery, setSearchParams]);

  const { state } = useMessageList({
    page,
    pageSize: PAGE_SIZE,
    q: debouncedQuery,
  });

  const goToPage = (next: number) => {
    const params = new URLSearchParams(searchParams);
    if (next <= 1) params.delete('page');
    else params.set('page', String(next));
    setSearchParams(params);
  };

  const totalLabel = useMemo(() => {
    if (state.kind !== 'success') return '';
    const { total } = state.data;
    return `${total} ${total === 1 ? 'submissão' : 'submissões'}`;
  }, [state]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Mensagens recebidas
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Submissões do formulário de contato do seu site profissional.
          </p>
        </div>
        {state.kind === 'success' ? (
          <span
            className="text-xs font-medium text-slate-500"
            aria-live="polite"
          >
            {totalLabel}
          </span>
        ) : null}
      </section>

      <section>
        <label htmlFor="search" className="sr-only">
          Buscar mensagens
        </label>
        <div className="relative">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path
              d="m20 20-3-3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            id="search"
            type="search"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Buscar por nome, e-mail ou texto da mensagem…"
            className="block w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>
      </section>

      <section aria-live="polite" aria-busy={state.kind === 'loading'}>
        {state.kind === 'loading' ? <ListSkeleton /> : null}
        {state.kind === 'error' ? (
          <ErrorState message={state.failure.message} />
        ) : null}
        {state.kind === 'success' && state.data.data.length === 0 ? (
          <EmptyState query={debouncedQuery} />
        ) : null}
        {state.kind === 'success' && state.data.data.length > 0 ? (
          <MessageTable rows={state.data.data} />
        ) : null}
      </section>

      {state.kind === 'success' && state.data.totalPages > 1 ? (
        <Pagination
          page={state.data.page}
          totalPages={state.data.totalPages}
          onChange={goToPage}
        />
      ) : null}
    </div>
  );
}

function MessageTable({ rows }: { rows: ContactMessage[] }) {
  return (
    <ul
      role="list"
      className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      {rows.map((m) => (
        <li key={m.id}>
          <Link
            to={`/messages/${m.id}`}
            className="group flex flex-col gap-1 px-4 py-4 transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/40 sm:px-6"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-sm font-semibold text-slate-900">
                  {m.name}
                </span>
                <span className="truncate text-xs text-slate-500">
                  {m.email}
                </span>
              </div>
              <time
                dateTime={m.createdAt}
                title={formatDateTime(m.createdAt)}
                className="shrink-0 text-xs text-slate-500"
              >
                {relativeTime(m.createdAt)}
              </time>
            </div>
            <p className="text-sm text-slate-600 group-hover:text-slate-800">
              {preview(m.message)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <ul
      role="list"
      aria-label="Carregando mensagens"
      className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="space-y-2 px-4 py-4 sm:px-6">
          <div className="flex justify-between gap-3">
            <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <p className="text-sm font-medium text-slate-900">
        {query ? 'Nenhum resultado' : 'Nenhuma submissão ainda'}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        {query
          ? `Não encontramos mensagens para "${query}".`
          : 'Quando o formulário do seu site receber uma mensagem, ela aparecerá aqui.'}
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800 sm:px-6"
    >
      {message}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
}) {
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;
  return (
    <nav
      aria-label="Paginação"
      className="flex items-center justify-between gap-3"
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={prevDisabled}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden="true">←</span> Anterior
      </button>
      <span className="text-xs text-slate-500" aria-live="polite">
        Página <strong className="text-slate-800">{page}</strong> de {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={nextDisabled}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Próxima <span aria-hidden="true">→</span>
      </button>
    </nav>
  );
}
