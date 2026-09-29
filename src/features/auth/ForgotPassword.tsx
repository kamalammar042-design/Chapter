import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { AlertCircle, MailCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { authErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/States';
import { useTitle } from '@/components/layout/Page';
import { AuthLayout } from './AuthLayout';

export default function ForgotPassword() {
  useTitle('Reset your password');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    // Same confirmation whether or not the account exists, so this form
    // cannot be used to discover who has an account. Only rate limits and
    // network failures are reported.
    if (err && (err.status === 429 || /fetch|network/i.test(err.message))) {
      setError(authErrorMessage(err, 'reset'));
      return;
    }
    setSent(true);
  };

  return (
    <AuthLayout
      title={sent ? 'Check your email' : 'Reset your password'}
      subtitle={sent ? undefined : "Enter your account's email and we'll send you a link to set a new password."}
      footer={<Link to="/signin" className="text-primary fw-500">Back to sign in</Link>}
    >
      {sent ? (
        <Alert tone="info" icon={<MailCheck />}>
          If an account exists for <strong>{email.trim()}</strong>, a reset link is on its way. The link expires in one hour.
        </Alert>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          {error && <Alert tone="danger" icon={<AlertCircle />}>{error}</Alert>}
          <Field label="Email">
            <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" block loading={busy}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}
