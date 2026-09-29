import { useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertCircle, LogOut, Trash2 } from 'lucide-react';
import { useProfile, useUpdateProfile } from '@/data/profile';
import { useAuth } from '@/features/auth/AuthProvider';
import { passwordProblem } from '@/features/auth/password';
import { supabase } from '@/lib/supabase';
import { invokeFunction } from '@/lib/functions';
import { authErrorMessage, errorMessage } from '@/lib/errors';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, PasswordInput } from '@/components/ui/Field';
import { Alert } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

export function AccountSettings() {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const { signOut, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [pw, setPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const saveName = () => update.mutate({ display_name: name.trim().slice(0, 40) || null }, {
    onSuccess: () => toast.success('Name updated'),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const changePassword = async () => {
    const problem = passwordProblem(pw);
    if (problem) return setPwError(problem);
    setPwBusy(true);
    setPwError(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwBusy(false);
    if (error) {
      setPwError((error as { code?: string }).code === 'reauthentication_needed'
        ? 'For security, sign out and sign in again before changing your password.'
        : authErrorMessage(error, 'update'));
      return;
    }
    setPw('');
    toast.success('Password changed');
  };

  return (
    <div className="stack-lg">
      <Card>
        <CardHeader title="Profile" />
        <div className="stack">
          <Field label="First name">
            <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email" hint="Contact support to change the email on your account.">
            <Input value={user?.email ?? ''} readOnly disabled />
          </Field>
          <div><Button onClick={saveName} loading={update.isPending} disabled={name.trim() === (profile?.display_name ?? '')}>Save</Button></div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Password" subtitle="At least 8 characters, with letters and numbers." />
        <div className="stack">
          {pwError && <Alert tone="danger" icon={<AlertCircle />}>{pwError}</Alert>}
          <Field label="New password"><PasswordInput autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <div><Button onClick={changePassword} loading={pwBusy} disabled={!pw}>Change password</Button></div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Session" />
        <div className="row row--wrap">
          <Button variant="secondary" icon={<LogOut />} onClick={async () => { await signOut(); navigate('/', { replace: true }); }}>Sign out</Button>
          <Button variant="ghost" onClick={async () => {
            await supabase.auth.signOut({ scope: 'global' });
            navigate('/signin', { replace: true });
          }}>Sign out on all devices</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Delete account" subtitle="Permanently delete your account and everything in it: progress, notes, flashcards, tutor history and memory. This cannot be undone." />
        <Button variant="danger" icon={<Trash2 />} onClick={() => setDeleteOpen(true)}>Delete my account</Button>
      </Card>

      {deleteOpen && <DeleteAccountDialog onClose={() => setDeleteOpen(false)} />}
    </div>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await invokeFunction('delete-account', { confirm: 'DELETE' });
      await supabase.auth.signOut({ scope: 'local' });
      try { localStorage.removeItem('chapter.theme'); } catch { /* ignore */ }
      navigate('/', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} busy={busy} title="Delete your account?"
      description="Any subscription is cancelled and all your data is deleted immediately."
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="danger" onClick={run} loading={busy} disabled={confirm !== 'DELETE'}>Delete forever</Button>
      </>}>
      {error && <Alert tone="danger" icon={<AlertCircle />}>{error}</Alert>}
      <Field label={<>Type <strong>DELETE</strong> to confirm</>}>
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" data-autofocus />
      </Field>
    </Dialog>
  );
}
