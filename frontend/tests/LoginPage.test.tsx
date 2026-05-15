import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../src/contexts/AuthContext';
import LoginPage from '../src/pages/LoginPage';

/**
 * Hand-craft an AuthProvider with a spy `login` so we can assert what
 * LoginPage forwards into it AND what it does with the resolved/rejected
 * promise — without ever hitting the real API.
 */
function renderWith(loginImpl: (email: string, pwd: string) => Promise<never>) {
  const login = vi.fn(loginImpl);
  render(
    <AuthContext.Provider
      value={{
        status: 'anonymous',
        user: null,
        login: login as never,
        logout: async () => {},
        refresh: async () => {},
      }}
    >
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>home-content</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { login };
}

describe('<LoginPage />', () => {
  it('calls authApi.login with the typed credentials', async () => {
    const user = userEvent.setup();
    const { login } = renderWith(async () => ({}) as never);

    await user.type(screen.getByLabelText(/e-mail/i), 'alice@test.com');
    await user.type(screen.getByLabelText(/^senha$/i), 'TopSecret-Pwd!');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    expect(login).toHaveBeenCalledWith('alice@test.com', 'TopSecret-Pwd!');
  });

  it('surfaces the generic credentials error from a rejected login', async () => {
    const user = userEvent.setup();
    renderWith(async () => {
      const err: { kind: string; message: string } = {
        kind: 'unauthorized',
        message: 'Credenciais inválidas',
      };
      throw err as never;
    });

    await user.type(screen.getByLabelText(/e-mail/i), 'alice@test.com');
    await user.type(screen.getByLabelText(/^senha$/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent(/credenciais inválidas/i);
  });

  it('renders the "Esqueci minha senha" link to /forgot-password', () => {
    renderWith(async () => ({}) as never);
    const link = screen.getByRole('link', { name: /esqueci minha senha/i });
    expect(link).toHaveAttribute('href', '/forgot-password');
  });
});
