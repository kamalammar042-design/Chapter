import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { PageLoader } from '@/components/ui/States';
import { useTitle } from '@/components/layout/Page';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './AuthProvider';

/** Email-confirmation landing page. supabase-js exchanges the code itself. */
export default function AuthCallback() {
  useTitle('Signing you in');
  const { session, loading } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const linkError = params.get('error_description') ?? hash.get('error_description');

  useEffect(() => {
    const t = window.setTimeout(() => setTimedOut(true), 6000);
    return () => window.clearTimeout(t);
  }, []);

  if (session) return <Navigate to="/home" replace />;
  if (linkError || (timedOut && !loading)) {
    return (
      <AuthLayout title="That link didn't work" subtitle="Confirmation links can only be used once and expire after a while."
        footer={<Link to="/signup" className="text-primary fw-500">Create an account</Link>}>
        <p className="text-2 mb-4">If you already confirmed your email, you can simply sign in.</p>
        <Link to="/signin" className="btn btn--primary btn--lg btn--block">Sign in</Link>
      </AuthLayout>
    );
  }
  return <PageLoader label="Confirming your email" />;
}
