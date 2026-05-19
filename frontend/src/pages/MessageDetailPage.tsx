import { Link, useParams } from 'react-router-dom';
import { useMessageDetail } from '../hooks/useMessages';
import { formatDateTime, relativeTime } from '../utils/time';

export default function MessageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const state = useMessageDetail(id);

  return (
    <div className="space-y-6">
      <BackLink />

      {state.kind === 'loading' ? <DetailSkeleton /> : null}
      {state.kind === 'error' && state.failure.kind === 'not-found' ? (
        <NotFoundState />
      ) : null}
      {state.kind === 'error' && state.failure.kind !== 'not-found' ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800 sm:px-6"
        >
          {state.failure.message}
        </div>
      ) : null}

      {state.kind === 'success' ? (
        <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="space-y-4 border-b border-slate-200 p-6 sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                {state.data.subject}
              </h1>
              <time
                dateTime={state.data.createdAt}
                className="text-xs text-slate-500"
              >
                <span className="block sm:inline">
                  {formatDateTime(state.data.createdAt)}
                </span>
                <span className="mx-2 hidden text-slate-300 sm:inline">·</span>
                <span className="block sm:inline">
                  {relativeTime(state.data.createdAt)}
                </span>
              </time>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">De:</span>
              <span className="text-slate-500">{state.data.name} </span>
              <a
                href={`mailto:${state.data.email}`}
                className="rounded-md font-medium text-indigo-600 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
              >
                {state.data.email}
              </a>
            </div>
          </header>

          <div className="p-6 sm:p-8">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Mensagem
            </h2>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
              {state.data.message}
            </p>
          </div>
        </article>
      ) : null}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-600 transition hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
    >
      <span aria-hidden="true">←</span> Voltar para a lista
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="h-5 w-1/3 animate-pulse rounded bg-slate-200" />
      <div className="h-3 w-1/4 animate-pulse rounded bg-slate-100" />
      <div className="space-y-2 pt-4">
        <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <p className="text-sm font-medium text-slate-900">
        Mensagem não encontrada
      </p>
      <p className="mt-1 text-sm text-slate-500">
        O registro pode ter sido removido ou o link está incorreto.
      </p>
    </div>
  );
}
