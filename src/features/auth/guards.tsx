import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthProvider';
import { useProfile } from '@/data/profile';
import { ErrorState, PageLoader } from '@/components/ui/States';

/** Only signed-in users pass; others go to sign-in and come back after. */
export function RequireAuth() {
  const { user, loading, expired } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader label="Checking your session" />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/signin?next=${next}${expired ? '&reason=expired' : ''}`} replace />;
  }
  return <Outlet />;
}

const PARENT_ALLOWED = ['/parent', '/settings'];

/**
 * Routes by account state: students finish onboarding first; parent
 * accounts only see parent pages. (The database enforces what each account
 * can read; this only shapes navigation.)
 */
export function RequireOnboarded() {
  const { data: profile, isLoading, error, refetch } = useProfile();
  const { pathname } = useLocation();
  if (isLoading) return <PageLoader />;
  if (error || !profile) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (profile.role === 'parent') {
    if (!PARENT_ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return <Navigate to="/parent" replace />;
    return <Outlet />;
  }
  if (!profile.onboarded_at) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** Public-only pages (landing, sign-in): signed-in users skip ahead. */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (user) {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={safeNext(next) ?? '/home'} replace />;
  }
  return <>{children}</>;
}

/** Only same-site relative paths are allowed as redirect targets. */
// eslint-disable-next-line react-refresh/only-export-components
export function safeNext(next: string | null): string | null {
  if (!next) return null;
  try {
    const decoded = decodeURIComponent(next);
    if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\')) return null;
    return decoded;
  } catch {
    return null;
  }
}
