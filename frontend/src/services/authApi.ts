import axios from 'axios';
import { api, toFailure, type ApiFailure } from './api';
import type { AuthSuccessResponse, AuthUser } from '../types/auth';

/**
 * POST /api/auth/login — cookies are set by the server on a 200.
 * The interceptor's auto-refresh logic is bypassed here because a 401 from
 * /login should surface as a credential error, not trigger a refresh attempt.
 */
export async function login(email: string, password: string): Promise<AuthUser> {
  try {
    const { data } = await api.post<AuthSuccessResponse>(
      '/api/auth/login',
      { email, password },
      { _skipAuthRefresh: true } as never,
    );
    return data.user;
  } catch (err) {
    if (axios.isCancel(err)) throw err;
    throw toFailure(err, 'Falha no login');
  }
}

/** POST /api/auth/logout — succeeds even if no session was active. */
export async function logout(): Promise<void> {
  try {
    await api.post('/api/auth/logout', null, { _skipAuthRefresh: true } as never);
  } catch (err) {
    // Logout is best-effort from the client's perspective; we still wipe local state.
    if (axios.isCancel(err)) throw err;
    // swallow other errors
  }
}

/**
 * GET /api/auth/me — used by AuthContext to discover the session on app start.
 * Returns null if the user is anonymous (instead of throwing) so callers can
 * branch cleanly without try/catch.
 */
export async function fetchCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    const { data } = await api.get<AuthSuccessResponse>('/api/auth/me', {
      signal,
      // Do let the interceptor try one refresh — if both /me and /refresh fail,
      // we genuinely don't have a session.
    });
    return data.user;
  } catch (err) {
    if (axios.isCancel(err)) throw err;
    const failure = err as ApiFailure & { response?: { status?: number } };
    // 401 = no session. Anything else surfaces as an error.
    if (
      failure?.kind === 'unauthorized' ||
      (err as { response?: { status?: number } })?.response?.status === 401
    ) {
      return null;
    }
    throw toFailure(err);
  }
}

export interface CreateUserInput {
  email: string;
  password: string;
}

/** POST /api/auth/users — admin-gated user creation. */
export async function createUser(input: CreateUserInput): Promise<AuthUser> {
  try {
    const { data } = await api.post<AuthSuccessResponse>('/api/auth/users', input);
    return data.user;
  } catch (err) {
    if (axios.isCancel(err)) throw err;
    throw toFailure(err, 'Falha ao criar usuário');
  }
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/**
 * PATCH /api/auth/me/password — change the current user's password.
 *
 * The backend revokes every refresh token of this user EXCEPT the one tied
 * to this browser, so the user stays signed in here but gets bumped on every
 * other device. Resolves to void on a 204.
 */
export async function changeOwnPassword(input: ChangePasswordInput): Promise<void> {
  try {
    await api.patch('/api/auth/me/password', input);
  } catch (err) {
    if (axios.isCancel(err)) throw err;
    throw toFailure(err, 'Falha ao alterar a senha');
  }
}

/**
 * POST /api/auth/password/forgot — request a reset link.
 *
 * Always resolves on a 204 — the server intentionally never tells us whether
 * the email exists. We treat any 4xx as "still done from the user's POV"
 * EXCEPT genuine network failures (which we propagate so the form can
 * show "try again later").
 */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await api.post('/api/auth/password/forgot', { email }, { _skipAuthRefresh: true } as never);
  } catch (err) {
    if (axios.isCancel(err)) throw err;
    const failure = toFailure(err);
    // Don't differentiate 429 from success at the UI layer: the goal is to be
    // boring and not leak any signal about the email's existence.
    if (failure.kind === 'network') throw failure;
    // For 4xx other than network errors we still pretend success.
  }
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

/** POST /api/auth/password/reset — exchange the token for a new password. */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  try {
    await api.post('/api/auth/password/reset', input, { _skipAuthRefresh: true } as never);
  } catch (err) {
    if (axios.isCancel(err)) throw err;
    throw toFailure(err, 'Não foi possível redefinir a senha');
  }
}
