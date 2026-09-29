import { useState } from 'react';
import { Download } from 'lucide-react';
import { useProfile, useUpdateProfile } from '@/data/profile';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/data/client';
import { errorMessage } from '@/lib/errors';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { UsernameDialog } from '@/features/leagues/Leagues';

export function PrivacySettings() {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const isStudent = profile?.role !== 'parent';

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await unwrap(supabase.rpc('export_my_data'));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chapter-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="stack-lg">
      {isStudent && (
        <Card>
          <CardHeader title="Leaderboard" subtitle="Others only ever see your username and weekly XP." />
          <div className="stack">
            <div className="row row--between">
              <div>
                <p className="fw-500">Show me on leaderboards</p>
                <p className="text-sm text-2">{profile?.username ? `Shown as “${profile.username}”` : 'You need a username to appear.'}</p>
              </div>
              <Switch label="Show me on leaderboards" checked={!!profile?.leaderboard_opt_in}
                onChange={(v) => update.mutate({ leaderboard_opt_in: v }, { onError: (e) => toast.error(errorMessage(e)) })} />
            </div>
            <div><Button variant="secondary" size="sm" onClick={() => setNameOpen(true)}>{profile?.username ? 'Change username' : 'Choose a username'}</Button></div>
          </div>
        </Card>
      )}
      <Card>
        <CardHeader title="Your data" subtitle="Download a copy of everything Chapter stores about you, as JSON." />
        <Button variant="secondary" icon={<Download />} loading={exporting} onClick={exportData}>Export my data</Button>
      </Card>
      <p className="text-sm text-3">Read the <a href="/privacy" target="_blank" className="text-primary">Privacy Policy</a> for details of what is stored and why.</p>
      {nameOpen && <UsernameDialog onClose={() => setNameOpen(false)} />}
    </div>
  );
}
