import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Archive, Flag, Plus, AlertCircle } from 'lucide-react';
import { getSubject, subjectLabel } from '@/content/catalog';
import { useProfile, useStudentSubjects } from '@/data/profile';
import { useActivity } from '@/data/progress';
import { useArchiveGoal, useCreateGoal, useGoals, usePaperAttempts } from '@/data/study';
import { Page, PageHeader, useTitle } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge, Segmented } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/Progress';
import { Alert, EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { SubjectIcon } from '@/components/SubjectIcon';
import { GOAL_META, goalProgress, STATUS_LABEL, ACCURACY_MIN_QUESTIONS, type GoalStatus } from '@/lib/goals';
import { addDays, formatDay, todayIn } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import type { GoalKind } from '@/lib/types';
import { GOAL_TITLE } from './goalText';

const STATUS_TONE: Record<GoalStatus, 'success' | 'primary' | 'warning' | 'neutral'> = {
  met: 'success', on_track: 'primary', behind: 'warning', not_enough_data: 'neutral', ended: 'neutral',
};

export default function Goals() {
  useTitle('Goals');
  const [sp, setSp] = useSearchParams();
  const profile = useProfile();
  const goals = useGoals();
  const activity = useActivity();
  const papers = usePaperAttempts();
  const archive = useArchiveGoal();
  const toast = useToast();
  const [creating, setCreating] = useState(sp.get('new') === '1');
  const today = todayIn(profile.data?.timezone ?? 'UTC');

  useEffect(() => {
    if (sp.get('new')) setSp({}, { replace: true });
  }, [sp, setSp]);

  const loading = goals.isLoading || activity.isLoading || papers.isLoading;

  return (
    <Page width="narrow">
      <PageHeader title="Goals" subtitle="Set targets you can measure. Progress updates automatically as you study."
        actions={<Button icon={<Plus />} onClick={() => setCreating(true)}>New goal</Button>} />

      {goals.error ? <ErrorState error={goals.error} onRetry={() => goals.refetch()} /> : loading ? (
        <div className="stack">{[0, 1].map((i) => <Skeleton key={i} height={110} radius={14} />)}</div>
      ) : goals.data?.length ? (
        <div className="stack">
          {goals.data.map((g) => {
            const gp = goalProgress(g, { activity: activity.data ?? [], papers: papers.data ?? [], today });
            return (
              <Card key={g.id}>
                <div className="row row--top">
                  {g.subject_key ? <SubjectIcon subjectKey={g.subject_key} /> : <span className="subject-icon" aria-hidden="true"><Flag /></span>}
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row row--between row--wrap">
                      <h2 className="fw-600">{GOAL_TITLE(g)}</h2>
                      <Badge tone={STATUS_TONE[gp.status]}>{STATUS_LABEL[gp.status]}</Badge>
                    </div>
                    <div className="mt-3"><ProgressBar value={gp.fraction} label={GOAL_TITLE(g)} tone={gp.status === 'met' ? 'success' : gp.status === 'behind' ? 'warning' : 'primary'} /></div>
                    <div className="row row--between text-sm mt-2 row--wrap">
                      <span className="text-2">{gp.valueLabel}</span>
                      <span className="text-3">
                        {gp.status === 'ended' ? `Ended ${formatDay(gp.window.end)}` : g.period === 'weekly' ? `Resets Monday · ${gp.daysLeft} day${gp.daysLeft === 1 ? '' : 's'} left` : `${gp.daysLeft} day${gp.daysLeft === 1 ? '' : 's'} left`}
                      </span>
                    </div>
                    {g.kind === 'accuracy' && gp.status === 'not_enough_data' && (
                      <p className="text-xs text-3 mt-1">Accuracy is judged after {ACCURACY_MIN_QUESTIONS} questions in this period.</p>
                    )}
                  </div>
                  <IconButton label={`Archive goal: ${GOAL_TITLE(g)}`} icon={<Archive />} size="sm" onClick={() => archive.mutate(g.id, {
                    onSuccess: () => toast.success('Goal archived'), onError: (e) => toast.error(errorMessage(e)),
                  })} />
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<Flag />} title="No goals yet"
          body="Students who set specific weekly targets study more consistently. Try 100 questions a week, or two past papers before your mock."
          actions={<Button icon={<Plus />} onClick={() => setCreating(true)}>Set your first goal</Button>} />
      )}

      {creating && <CreateGoalDialog today={today} onClose={() => setCreating(false)} />}
    </Page>
  );
}

function CreateGoalDialog({ today, onClose }: { today: string; onClose: () => void }) {
  const create = useCreateGoal();
  const subjects = useStudentSubjects();
  const toast = useToast();
  const [kind, setKind] = useState<GoalKind>('questions');
  const [period, setPeriod] = useState<'weekly' | 'by_date'>('weekly');
  const [target, setTarget] = useState('100');
  const [subject, setSubject] = useState('');
  const [label, setLabel] = useState('');
  const [due, setDue] = useState(addDays(today, 28));
  const [error, setError] = useState<string | null>(null);
  const meta = GOAL_META[kind];

  const defaults: Record<GoalKind, string> = { questions: '100', practice_minutes: '120', accuracy: '75', flashcards: '100', papers: '2', paper_score: '70', sat_score: '1400' };
  const pickKind = (k: GoalKind) => {
    setKind(k);
    setTarget(defaults[k]);
    if (!GOAL_META[k].subjectScoped) setSubject('');
    if (k === 'paper_score' || k === 'sat_score') setPeriod('by_date');
  };

  const save = () => {
    const t = Number(target);
    if (!Number.isFinite(t) || t < meta.min || t > meta.max) return setError(`Choose a target between ${meta.min} and ${meta.max}.`);
    if (period === 'by_date' && due <= today) return setError('The deadline must be in the future.');
    if (kind === 'paper_score' && !subject) return setError('Choose which subject this score is for.');
    create.mutate({
      kind, period, target: t, subject_key: meta.subjectScoped ? subject || null : null,
      target_label: kind === 'paper_score' ? label.trim() || null : null, due_date: period === 'by_date' ? due : null,
    }, {
      onSuccess: () => { toast.success('Goal created'); onClose(); },
      onError: (e) => setError(errorMessage(e)),
    });
  };

  return (
    <Dialog open onClose={onClose} busy={create.isPending} title="New goal"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={create.isPending}>Create goal</Button></>}>
      {error && <Alert tone="danger" icon={<AlertCircle />}>{error}</Alert>}
      <Field label="What do you want to achieve?">
        <Select value={kind} onChange={(e) => pickKind(e.target.value as GoalKind)}>
          {(Object.keys(GOAL_META) as GoalKind[]).map((k) => <option key={k} value={k}>{GOAL_META[k].label}</option>)}
        </Select>
      </Field>
      <div className="grid-2">
        <Field label={`Target (${meta.unit})`}>
          <Input type="number" inputMode="numeric" min={meta.min} max={meta.max} step={meta.step} value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        {meta.subjectScoped && (
          <Field label="Subject" optional={kind === 'papers'}>
            <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">{kind === 'papers' ? 'Any subject' : 'Choose…'}</option>
              {(subjects.data ?? []).map((s) => { const sub = getSubject(s.subject_key); return sub ? <option key={s.subject_key} value={s.subject_key}>{subjectLabel(sub)}</option> : null; })}
            </Select>
          </Field>
        )}
      </div>
      {kind === 'paper_score' && (
        <Field label="Grade this represents" optional hint="For your own reference, e.g. A*. Grade boundaries vary each series, so Chapter tracks the percentage.">
          <Input value={label} maxLength={12} onChange={(e) => setLabel(e.target.value)} />
        </Field>
      )}
      <div className="stack-sm">
        <span className="field__label">Timeframe</span>
        <Segmented label="Timeframe" value={period} onChange={setPeriod} options={[{ value: 'weekly', label: 'Every week' }, { value: 'by_date', label: 'By a date' }]} />
        {period === 'by_date' && (
          <Field label="Deadline"><Input type="date" min={addDays(today, 1)} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        )}
      </div>
    </Dialog>
  );
}
