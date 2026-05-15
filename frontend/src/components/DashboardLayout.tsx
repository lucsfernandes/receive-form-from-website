import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface DashboardLayoutProps {
  children: ReactNode;
}

const NAV_LINKS: Array<{ to: string; label: string }> = [
  { to: '/', label: 'Mensagens' },
  { to: '/users', label: 'Usuários' },
];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);

  // Routes that hide the in-app nav. /forgot-password and /reset-password are
  // public and shouldn't surface the dashboard chrome.
  const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password'];
  const isPublicRoute = PUBLIC_ROUTES.includes(location.pathname);
  const showNav = status === 'authenticated' && !isPublicRoute;

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-50 via-white to-slate-100">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <Link
              to={status === 'authenticated' ? '/' : '/login'}
              className="flex items-baseline gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
                Inbox
              </span>
              <span className="text-base font-semibold text-slate-900">
                receive-forms
              </span>
            </Link>

            {showNav ? (
              <nav className="hidden items-center gap-1 sm:flex" aria-label="Principal">
                {NAV_LINKS.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === '/'}
                    className={({ isActive }) =>
                      `rounded-md px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-slate-600 hover:text-slate-900'
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
              </nav>
            ) : null}

            <div className="flex items-center gap-3">
              {status === 'authenticated' && user ? (
                <>
                  <Link
                    to="/account"
                    className="hidden text-xs text-slate-500 hover:text-slate-700 underline decoration-dotted underline-offset-2 sm:inline"
                    title={`Conta: ${user.email}`}
                  >
                    {user.email}
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={signingOut}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:opacity-60"
                  >
                    {signingOut ? 'Saindo…' : 'Sair'}
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {showNav ? (
            <nav
              className="mt-3 flex items-center gap-1 sm:hidden"
              aria-label="Principal (mobile)"
            >
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/'}
                  className={({ isActive }) =>
                    `flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-slate-600 hover:text-slate-900'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8 sm:py-12">{children}</main>
      <footer className="mx-auto max-w-5xl px-5 pb-10 pt-4 text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} receive-forms-app
      </footer>
    </div>
  );
}
