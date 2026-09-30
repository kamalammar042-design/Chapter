import { useState } from 'react';
import { BellRing, Smartphone } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/data/client';
import { useUser } from '@/features/auth/AuthProvider';
import { Card, CardHeader } from '@/components/ui/Card';
import { Select, Switch } from '@/components/ui/Field';
import { Alert, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { disablePush, enablePush, pushConfigured, pushSupport, PushError, type PushProblem } from '@/lib/push';
import { errorMessage } from '@/lib/errors';

interface Reminders { enabled: boolean; hour: number; devices: number; timezone: string | null }

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 07:00 – 22:00

function hourLabel(h: number): string {
  return new Date(2026, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const PROBLEMS: Record<PushProblem, string> = {
  unsupported: 'This browser cannot receive notifications. Try Chrome, Edge, Firefox or Safari on a computer or Android phone.',
  ios_install: 'On iPhone and iPad, add Chapter to your Home Screen first (Share → Add to Home Screen), then turn reminders on from there.',
  denied: 'Notifications are blocked for Chapter in your browser settings. Allow them for this site, then try again.',
  failed: 'Could not set up notifications. Please try again.',
};

/** Opt-in review reminders (web push through OneSignal). Hidden until push is configured. */
export function RemindersCard() {
  const user = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const key = ['reminders', user.id] as const;
  const query = useQuery({ queryKey: key, queryFn: () => unwrap<Reminders>(supabase.rpc('my_reminders')), enabled: pushConfigured });
  const [problem, setProblem] = useState<PushProblem | null>(null);

  const save = useMutation({
    mutationFn: async ({ enabled, hour }: { enabled: boolean; hour: number }) => {
      setProblem(null);
      if (!enabled) {
        await disablePush();
        return unwrap<Reminders>(supabase.rpc('set_reminders', { p_enabled: false, p_hour: hour }));
      }
      const id = await enablePush();
      return unwrap<Reminders>(supabase.rpc('set_reminders', { p_enabled: true, p_hour: hour, p_subscription: id }));
    },
    onSuccess: (data, vars) => {
      qc.setQueryData(key, data);
      toast.success(vars.enabled ? `Reminders on for ${hourLabel(vars.hour)}` : 'Reminders off');
    },
    onError: (e) => {
      if (e instanceof PushError) setProblem(e.problem);
      else toast.error(errorMessage(e));
    },
  });

  if (!pushConfigured) return null;
  const r = query.data;
  const support = pushSupport();

  return (
    <Card>
      <CardHeader title="Review reminders" subtitle="A nudge when skills are due for review, so they don't slip. At most one a day, and only if you haven't studied yet that day." />
      {!r ? <Skeleton height={72} /> : (
        <div className="stack">
          <div className="row" style={{ justifyContent: 'space-between', gap: 16 }}>
            <div className="row-sm" style={{ minWidth: 0 }}>
              <BellRing aria-hidden="true" size={18} />
              <span className="fw-500">Remind me</span>
            </div>
            <Switch label="Review reminders" checked={r.enabled} disabled={save.isPending || (support !== 'ok' && !r.enabled)}
              onChange={(v) => save.mutate({ enabled: v, hour: r.hour })} />
          </div>
          <label className="stack-sm" style={{ gap: 4 }}>
            <span className="field__label">Time</span>
            <Select value={r.hour} disabled={save.isPending || !r.enabled} style={{ maxWidth: 200 }}
              onChange={(e) => save.mutate({ enabled: true, hour: Number(e.target.value) })}>
              {(HOURS.includes(r.hour) ? HOURS : [...HOURS, r.hour].sort((a, b) => a - b)).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </Select>
            <span className="field__hint">In your time zone{r.timezone ? ` (${r.timezone.replace(/_/g, ' ')})` : ''}. The notification only says how many skills are due.</span>
          </label>
          {r.enabled && r.devices > 0 && (
            <p className="text-xs text-3 row-sm"><Smartphone aria-hidden="true" size={14} /> On for {r.devices === 1 ? 'this browser' : `${r.devices} browsers`}. Turning reminders off stops them everywhere.</p>
          )}
          {(problem || (support !== 'ok' && !r.enabled)) && (
            <Alert tone={problem === 'failed' ? 'danger' : 'info'}>{PROBLEMS[problem ?? (support as PushProblem)]}</Alert>
          )}
        </div>
      )}
    </Card>
  );
}
