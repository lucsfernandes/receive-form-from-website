import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { onUnauthorized } from '../services/api';
import {
  fetchCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
} from '../services/authApi';
import type { AuthUser } from '../types/auth';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Owns the current session. Tries to discover one on mount via GET /auth/me,
 * exposes login/logout actions, and listens for the API's "unauthorized" event
 * (emitted when a request fails and the silent-refresh also fails) so we can
 * drop the user back to the login screen without scattering 401 handling
 * across components.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  // Guards against state updates after unmount during the initial /me fetch.
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const fetched = await fetchCurrentUser();
      if (!aliveRef.current) return;
      if (fetched) {
        setUser(fetched);
        setStatus('authenticated');
      } else {
        setUser(null);
        setStatus('anonymous');
      }
    } catch {
      if (!aliveRef.current) return;
      // Network or 5xx — treat as anonymous so the SPA degrades gracefully.
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    return () => {
      aliveRef.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    const off = onUnauthorized(() => {
      setUser(null);
      setStatus('anonymous');
    });
    return off;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const next = await loginRequest(email, password);
    setUser(next);
    setStatus('authenticated');
    return next;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout, refresh }),
    [status, user, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
