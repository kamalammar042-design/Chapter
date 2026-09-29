import { Gauge } from 'lucide-react';
import { useAiAllowance, useQuota } from '@/data/progress';
import { formatDay } from '@/lib/dates';
import { Card, CardHeader } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/Progress';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { PlusCard } from './PlusCard';

/**
 * Chapter is free. The only limits are monthly fair-use allowances on the AI
 * features (each AI request has a real cost), enforced on the server.
 */
export function UsageSettings() {
  const quota = useQuota();
  const tutor = useAiAllowance('tutor_message');
  const generate = useAiAllowance('generate');
  const loading = tutor.isLoading || generate.isLoading;
  const error = tutor.error ?? generate.error;
  const resets = quota.data?.resets_on ? formatDay(quota.data.resets_on, { day: 'numeric', month: 'long' }) : 'the 1st of next month';

  return (
    <div className="stack-lg">
      <Card>
        <CardHeader title="This month" subtitle="Chapter is free. AI features have a monthly fair-use allowance so they stay available for everyone." action={tutor.data?.plus ? <span className="badge badge--primary">Plus: 3× allowance</span> : undefined} />
        {loading ? <Skeleton height={80} /> : error ? <ErrorState compact error={error} onRetry={() => { void tutor.refetch(); void generate.refetch(); }} /> : (
          <div className="stack">
            {tutor.data && tutor.data.cap > 0 && (
              <div className="stack-sm">
                <div className="row row--between text-sm"><span>Tutor messages</span><span className="num text-2">{tutor.data.used} of {tutor.data.cap}</span></div>
                <ProgressBar value={tutor.data.used} max={tutor.data.cap} label="Tutor messages used this month" />
              </div>
            )}
            {generate.data && generate.data.cap > 0 && (
              <div className="stack-sm">
                <div className="row row--between text-sm"><span>AI questions and flashcards</span><span className="num text-2">{generate.data.used} of {generate.data.cap}</span></div>
                <ProgressBar value={generate.data.used} max={generate.data.cap} label="AI generations used this month" />
              </div>
            )}
            {quota.data && !quota.data.unlimited && (
              <div className="stack-sm">
                <div className="row row--between text-sm"><span>Practice questions</span><span className="num text-2">{quota.data.used ?? 0} of {quota.data.limit ?? 100}</span></div>
                <ProgressBar value={quota.data.used ?? 0} max={quota.data.limit ?? 100} label="Practice questions used this month" />
              </div>
            )}
            {quota.data?.unlimited && <p className="text-sm text-2">Practice questions, flashcards, notes and papers have no limit.</p>}
            <p className="text-xs text-3 row-sm"><Gauge size={13} aria-hidden="true" /> Allowances reset on {resets}. Your progress, streak and mastery are never reset.</p>
          </div>
        )}
      </Card>
      <PlusCard />
    </div>
  );
}
