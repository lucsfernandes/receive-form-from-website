import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface RequireAuthProps {
  children: ReactNode;
}

/**
 * Gate that redirects anonymous users to /login and preserves the original
 * destination via the `next` query param so login can bounce them back.
 *
 * While the initial /me request is in flight we render a tiny placeholder
 * instead of either the children or the login redirect — flickering the
 * router during a 100ms fetch is worse than a brief loading hint.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div
        className="flex min-h-[40dvh] items-center justify-center text-sm text-slate-500"
        role="status"
        aria-live="polite"
      >
        Verificando sessão…
      </div>
    );
  }

  if (status === 'anonymous') {
    const next = `${location.pathname}${location.search}${location.hash}`;
    const search = next && next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
    return <Navigate to={`/login${search}`} replace />;
  }

  return <>{children}</>;
}
