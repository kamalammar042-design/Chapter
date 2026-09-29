import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { SUBJECTS, getSubject, subjectLabel } from '@/content/catalog';
import { useLogPaperAttempt } from '@/data/study';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Alert } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { browserTimeZone, todayIn } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import type { Resource } from '@/lib/types';
import { SESSION_LABEL } from './paperMeta';

export function LogPaperDialog({ paper, defaultSubject, onClose }: { paper: Resource | null; defaultSubject: string; onClose: () => void }) {
  const log = useLogPaperAttempt();
  const toast = useToast();
  const today = todayIn(browserTimeZone());
  const [subjectKey, setSubjectKey] = useState(paper?.subject_key ?? defaultSubject ?? '');
  const [title, setTitle] = useState(paper ? [paper.title, paper.session && paper.year ? `(${SESSION_LABEL[paper.session]} ${paper.year})` : null].filter(Boolean).join(' ') : '');
  const [score, setScore] = useState('');
  const [max, setMax] = useState(paper?.max_marks ? String(paper.max_marks) : '');
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState(paper?.duration_minutes ? String(paper.duration_minutes) : '');
  const [reflection, setReflection] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isSat = getSubject(subjectKey)?.program === 'sat';

  const save = () => {
    const e: Record<string, string> = {};
    const s = Number(score);
    const m = Number(max);
    if (!subjectKey) e.subject = 'Choose a subject.';
    if (!title.trim()) e.title = 'Give this attempt a name, e.g. "Paper 2, June 2024".';
    if (!max || !Number.isFinite(m) || m <= 0 || m > 2000) e.max = 'Enter the total marks available.';
    if (score === '' || !Number.isFinite(s) || s < 0) e.score = 'Enter your mark.';
    else if (m > 0 && s > m) e.score = 'Your mark cannot be higher than the total.';
    if (date > today) e.date = 'The date cannot be in the future.';
    const mins = minutes ? Number(minutes) : null;
    if (mins !== null && (!Number.isInteger(mins) || mins < 1 || mins > 600)) e.minutes = 'Enter whole minutes between 1 and 600.';
    setErrors(e);
    if (Object.keys(e).length) return;
    log.mutate({
      paper_id: paper?.id ?? null,
      subject_key: subjectKey,
      title: title.trim().slice(0, 160),
      score: s,
      max_score: m,
      completed_on: date,
      duration_minutes: mins,
      reflection: reflection.trim() || null,
    }, {
      onSuccess: () => { toast.success(`Logged: ${Math.round((s / m) * 100)}%`); onClose(); },
      onError: (err) => setErrors({ form: errorMessage(err) }),
    });
  };

  return (
    <Dialog open onClose={onClose} busy={log.isPending} title="Log a past paper" description="Mark it with the official mark scheme, then record your score."
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={log.isPending}>Cancel</Button>
        <Button onClick={save} loading={log.isPending}>Save score</Button>
      </>}>
      {errors.form && <Alert tone="danger" icon={<AlertCircle />}>{errors.form}</Alert>}
      {!paper && (
        <Field label="Subject" error={errors.subject}>
          <Select value={subjectKey} onChange={(e) => { setSubjectKey(e.target.value); if (getSubject(e.target.value)?.program === 'sat' && !max) setMax('1600'); }}>
            <option value="">Choose…</option>
            {SUBJECTS.map((s) => <option key={s.key} value={s.key}>{s.program === 'igcse' ? `IGCSE ${s.name}` : subjectLabel(s)}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Paper" error={errors.title} hint={paper ? undefined : 'e.g. "Paper 4, May/June 2024, variant 2"'}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
      </Field>
      <div className="grid-2">
        <Field label="Your mark" error={errors.score}>
          <Input type="number" inputMode="decimal" min={0} step="0.5" value={score} onChange={(e) => setScore(e.target.value)} />
        </Field>
        <Field label="Out of" error={errors.max} hint={isSat ? 'Full SAT practice test: 1600. One section: 800.' : undefined}>
          <Input type="number" inputMode="numeric" min={1} value={max} onChange={(e) => setMax(e.target.value)} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Date" error={errors.date}>
          <Input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time taken (minutes)" error={errors.minutes} optional>
          <Input type="number" inputMode="numeric" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
      </div>
      <Field label="What would you do differently?" optional>
        <Textarea rows={2} maxLength={2000} value={reflection} onChange={(e) => setReflection(e.target.value)} />
      </Field>
    </Dialog>
  );
}
