import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlertCircle, GraduationCap, MailCheck, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { authErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Field, Input, PasswordInput } from '@/components/ui/Field';
import { Alert } from '@/components/ui/States';
import { useTitle } from '@/components/layout/Page';
import { AuthLayout } from './AuthLayout';
import { passwordProblem } from './password';

export default function SignUp() {
  useTitle('Create your account');
  const [params] = useSearchParams();
  const [role, setRole] = useState<'student' | 'parent'>(params.get('role') === 'parent' ? 'parent' : 'student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Tell us what to call you.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Enter a valid email address.';
    const pw = passwordProblem(password);
    if (pw) errs.password = pw;
    if (!agree) errs.agree = 'Please accept the terms to continue.';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { display_name: name.trim().slice(0, 40), role },
      },
    });
    setBusy(false);
    if (err) {
      setError(authErrorMessage(err, 'signup'));
      return;
    }
    // With email confirmation on (production), there is no session yet.
    if (!data.session) setSentTo(email.trim());
  };

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" subtitle={<>We sent a confirmation link to <strong>{sentTo}</strong>.</>}
        footer={<>Wrong address? <button className="text-primary fw-500" style={{ background: 'none', border: 0, padding: 0 }} onClick={() => setSentTo(null)}>Start again</button></>}>
        <div className="stack">
          <Alert tone="info" icon={<MailCheck />}>
            Open the link on this device to finish creating your account. It can take a minute to arrive; check your spam folder too.
          </Alert>
          <Link to="/signin" className="btn btn--secondary btn--lg btn--block">Back to sign in</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free to start. No card needed."
      footer={<>Already have an account? <Link to="/signin" className="text-primary fw-500">Sign in</Link></>}
    >
      <form className="stack" onSubmit={submit} noValidate>
        {error && <Alert tone="danger" icon={<AlertCircle />}>{error}</Alert>}
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label mb-2">I am a…</legend>
          <div className="grid-2" style={{ gap: 8 }}>
            <button type="button" className="choice" aria-pressed={role === 'student'} onClick={() => setRole('student')}>
              <GraduationCap size={18} aria-hidden="true" /> Student
            </button>
            <button type="button" className="choice" aria-pressed={role === 'parent'} onClick={() => setRole('parent')}>
              <Users size={18} aria-hidden="true" /> Parent
            </button>
          </div>
          {role === 'parent' && (
            <p className="field__hint">Parents see progress their student chooses to share, using a code from the student's account.</p>
          )}
        </fieldset>
        <Field label="Your first name" error={fieldErrors.name}>
          <Input autoComplete="given-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" error={fieldErrors.password} hint="At least 8 characters, with letters and numbers.">
          <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="stack-sm">
          <label className="checkbox">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} aria-invalid={!!fieldErrors.agree} />
            <span>I agree to the <Link to="/terms" className="text-primary" target="_blank">Terms</Link> and <Link to="/privacy" className="text-primary" target="_blank">Privacy Policy</Link>. If I'm under 16, a parent or guardian has agreed too.</span>
          </label>
          {fieldErrors.agree && <p className="field__error" role="alert"><AlertCircle size={13} aria-hidden="true" /> {fieldErrors.agree}</p>}
        </div>
        <Button type="submit" size="lg" block loading={busy}>Create account</Button>
      </form>
    </AuthLayout>
  );
}
