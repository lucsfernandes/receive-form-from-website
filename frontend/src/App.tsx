import { Route, BrowserRouter, Routes } from 'react-router-dom';
import { DashboardLayout } from './components/DashboardLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RequireAuth } from './components/RequireAuth';
import { AuthProvider } from './contexts/AuthContext';
import AccountPage from './pages/AccountPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import LoginPage from './pages/LoginPage';
import MessagesListPage from './pages/MessagesListPage';
import MessageDetailPage from './pages/MessageDetailPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import UsersPage from './pages/UsersPage';

/**
 * Top-level routing.
 *
 * AuthProvider is mounted INSIDE BrowserRouter so its login/logout helpers can
 * call useNavigate via the components they end up rendering. DashboardLayout
 * wraps every route — its header adapts to the auth state (shows nav + logout
 * when signed in, otherwise just the brand).
 *
 * The 404 catch-all is gated by <RequireAuth> too, so an anonymous visitor
 * hitting an unknown path is bounced to /login with the original path in `next`.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DashboardLayout>
          <ErrorBoundary>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <MessagesListPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/messages/:id"
                element={
                  <RequireAuth>
                    <MessageDetailPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/users"
                element={
                  <RequireAuth>
                    <UsersPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/account"
                element={
                  <RequireAuth>
                    <AccountPage />
                  </RequireAuth>
                }
              />
              <Route
                path="*"
                element={
                  <RequireAuth>
                    <MessagesListPage />
                  </RequireAuth>
                }
              />
            </Routes>
          </ErrorBoundary>
        </DashboardLayout>
      </AuthProvider>
    </BrowserRouter>
  );
}
