import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { authErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Field, PasswordInput } from '@/components/ui/Field';
import { Alert, PageLoader } from '@/components/ui/States';
import { useTitle } from '@/components/layout/Page';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './AuthProvider';
import { passwordProblem } from './password';

/**
 * Landing page for the password-reset email. supabase-js exchanges the
 * one-time code in the URL for a recovery session; then the student sets a
 * new password.
 */
export default function ResetPassword() {
  useTitle('Choose a new password');
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waited, setWaited] = useState(false);
  const linkError = new URLSearchParams(window.location.search).get('error_description')
    ?? new URLSearchParams(window.location.hash.slice(1)).get('error_description');

  // give the code exchange a moment before declaring the link invalid
  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), 2500);
    return () => window.clearTimeout(t);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setBusy(false);
      setError(authErrorMessage(err, 'update'));
      return;
    }
    // end every session so the new password is required everywhere
    await supabase.auth.signOut({ scope: 'global' });
    navigate('/signin?reset=done', { replace: true });
  };

  if (!session && (loading || !waited) && !linkError) return <PageLoader label="Checking your reset link" />;

  if (!session) {
    return (
      <AuthLayout title="This link has expired" subtitle="Reset links work once and expire after an hour."
        footer={<Link to="/signin" className="text-primary fw-500">Back to sign in</Link>}>
        <Link to="/forgot-password" className="btn btn--primary btn--lg btn--block">Send a new link</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Pick something you haven't used before.">
      <form className="stack" onSubmit={submit} noValidate>
        {error && <Alert tone="danger" icon={<AlertCircle />}>{error}</Alert>}
        <Field label="New password" hint="At least 8 characters, with letters and numbers.">
          <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm new password">
          <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" block loading={busy}>Update password</Button>
      </form>
    </AuthLayout>
  );
}
