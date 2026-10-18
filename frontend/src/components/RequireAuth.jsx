import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './Spinner';

/** Navigation guard only: sends visitors without a session to the login page. The server authorizes every call. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
