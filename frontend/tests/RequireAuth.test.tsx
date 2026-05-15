import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../src/contexts/AuthContext';
import { RequireAuth } from '../src/components/RequireAuth';

/**
 * Drive RequireAuth through a hand-rolled AuthContext provider so we can
 * exercise every status (`loading`, `anonymous`, `authenticated`) without
 * touching the real /api/auth/me endpoint.
 */
function renderAt(path: string, contextValue: React.ContextType<typeof AuthContext>) {
  return render(
    <AuthContext.Provider value={contextValue}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/secret"
            element={
              <RequireAuth>
                <div>secret-content</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<div>login-page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('<RequireAuth />', () => {
  it('renders a placeholder while the session is still being discovered', () => {
    renderAt('/secret', {
      status: 'loading',
      user: null,
      login: async () => ({}) as never,
      logout: async () => {},
      refresh: async () => {},
    });
    expect(screen.getByText(/verificando sessão/i)).toBeInTheDocument();
    expect(screen.queryByText('secret-content')).not.toBeInTheDocument();
  });

  it('redirects anonymous users to /login', () => {
    renderAt('/secret', {
      status: 'anonymous',
      user: null,
      login: async () => ({}) as never,
      logout: async () => {},
      refresh: async () => {},
    });
    expect(screen.getByText('login-page')).toBeInTheDocument();
    expect(screen.queryByText('secret-content')).not.toBeInTheDocument();
  });

  it('renders children for an authenticated user', () => {
    renderAt('/secret', {
      status: 'authenticated',
      user: {
        id: 'u1',
        email: 'alice@test.com',
        role: 'admin',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        lastLoginAt: null,
      },
      login: async () => ({}) as never,
      logout: async () => {},
      refresh: async () => {},
    });
    expect(screen.getByText('secret-content')).toBeInTheDocument();
    expect(screen.queryByText('login-page')).not.toBeInTheDocument();
  });
});
