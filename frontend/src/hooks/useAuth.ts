import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

/** Read the current session. Throws if used outside <AuthProvider>. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
