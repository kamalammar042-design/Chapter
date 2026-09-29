import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AlertCircle, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { authErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Field, Input, PasswordInput } from '@/components/ui/Field';
import { Alert } from '@/components/ui/States';
import { useTitle } from '@/components/layout/Page';
import { AuthLayout } from './AuthLayout';
import { safeNext } from './guards';

export default function SignIn() {
  useTitle('Sign in');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notice = params.get('reason') === 'expired' ? 'Your session expired. Please sign in again.'
    : params.get('reset') === 'done' ? 'Your password has been changed. Sign in with your new password.' : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) {
      setError(authErrorMessage(err, 'signin'));
      return;
    }
    navigate(safeNext(params.get('next')) ?? '/home', { replace: true });
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={<>New to Chapter? <Link to="/signup" className="text-primary fw-500">Create an account</Link></>}
    >
      <form className="stack" onSubmit={submit} noValidate>
        {notice && <Alert tone="info" icon={<Info />}>{notice}</Alert>}
        {error && <Alert tone="danger" icon={<AlertCircle />}>{error}</Alert>}
        <Field label="Email">
          <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <div className="stack-sm">
          <Field label="Password">
            <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Link to="/forgot-password" className="text-primary text-sm fw-500" style={{ justifySelf: 'end' }}>Forgot password?</Link>
        </div>
        <Button type="submit" size="lg" block loading={busy}>Sign in</Button>
      </form>
    </AuthLayout>
  );
}
