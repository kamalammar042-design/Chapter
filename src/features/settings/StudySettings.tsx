import { useEffect, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { PROGRAMS, SUBJECTS, getSubject, subjectLabel, type IgcseTier, type ProgramKey } from '@/content/catalog';
import { useProfile, useSaveSubjects, useStudentSubjects, useUpdateProfile } from '@/data/profile';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { SubjectIcon } from '@/components/SubjectIcon';
import { browserTimeZone, todayIn } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import type { StudentSubject } from '@/lib/types';

export function StudySettings() {
  const { data: profile } = useProfile();
  const subjects = useStudentSubjects();
  const updateProfile = useUpdateProfile();
  const save = useSaveSubjects();
  const toast = useToast();
  const [rows, setRows] = useState<StudentSubject[] | null>(null);
  const [adding, setAdding] = useState('');
  const today = todayIn(browserTimeZone());

  useEffect(() => { if (subjects.data && rows === null) setRows(subjects.data); }, [subjects.data, rows]);

  const setProfileField = (patch: { program?: ProgramKey; igcse_tier?: IgcseTier }) =>
    updateProfile.mutate(patch, { onSuccess: () => toast.success('Saved'), onError: (e) => toast.error(errorMessage(e)) });

  const dirty = JSON.stringify(rows) !== JSON.stringify(subjects.data);
  const update = (k: string, patch: Partial<StudentSubject>) => setRows((rs) => rs!.map((r) => (r.subject_key === k ? { ...r, ...patch } : r)));

  return (
    <div className="stack-lg">
      <Card>
        <CardHeader title="Exams" subtitle="Your main program decides which leaderboard you're in." />
        <div className="stack">
          <div className="stack-sm">
            <span className="field__label">Main program</span>
            <Segmented label="Main program" value={profile?.program ?? 'igcse'} onChange={(v) => setProfileField({ program: v })}
              options={(Object.keys(PROGRAMS) as ProgramKey[]).map((p) => ({ value: p, label: PROGRAMS[p].name }))} />
          </div>
          <div className="stack-sm">
            <span className="field__label">IGCSE tier</span>
            <Segmented label="IGCSE tier" value={profile?.igcse_tier ?? 'extended'} onChange={(v) => setProfileField({ igcse_tier: v })}
              options={[{ value: 'core', label: 'Core' }, { value: 'extended', label: 'Extended' }]} />
            <p className="field__hint">Core practice leaves out the hardest questions.</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Subjects, exam dates and targets" />
        {!rows ? <Skeleton height={120} /> : (
          <div className="stack">
            {rows.map((r) => {
              const s = getSubject(r.subject_key);
              if (!s) return null;
              const program = PROGRAMS[s.program];
              return (
                <div key={r.subject_key} className="subject-setting">
                  <div className="row" style={{ minWidth: 0 }}>
                    <SubjectIcon subjectKey={s.key} size="sm" />
                    <span className="fw-500 truncate grow">{subjectLabel(s)}</span>
                    <IconButton label={`Remove ${subjectLabel(s)}`} icon={<Trash2 />} size="sm" onClick={() => setRows((rs) => rs!.filter((x) => x.subject_key !== r.subject_key))} disabled={rows.length <= 1} />
                  </div>
                  <div className="onboarding__inputs">
                    <label className="stack-sm" style={{ gap: 4 }}>
                      <span className="text-xs text-3">Exam date</span>
                      <input className="input" type="date" min={today} value={r.exam_date ?? ''} onChange={(e) => update(r.subject_key, { exam_date: e.target.value || null })} />
                    </label>
                    <label className="stack-sm" style={{ gap: 4 }}>
                      <span className="text-xs text-3">{program.targetKind === 'grade' ? 'Target grade' : 'Target score'}</span>
                      <select className="select" value={r.target_grade ?? ''} onChange={(e) => update(r.subject_key, { target_grade: e.target.value || null })}>
                        <option value="">Not set</option>
                        {program.targets.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              );
            })}
            <div className="row row--wrap">
              <Select aria-label="Add a subject" value={adding} onChange={(e) => setAdding(e.target.value)} style={{ maxWidth: 280 }}>
                <option value="">Add a subject…</option>
                {SUBJECTS.filter((s) => !rows.some((r) => r.subject_key === s.key)).map((s) => (
                  <option key={s.key} value={s.key}>{s.program === 'igcse' ? `IGCSE ${s.name}` : subjectLabel(s)}</option>
                ))}
              </Select>
              <Button variant="secondary" disabled={!adding} onClick={() => { setRows((rs) => [...rs!, { subject_key: adding, exam_date: null, target_grade: null, confidence: null }]); setAdding(''); }}>Add</Button>
            </div>
            <div className="row">
              <Button icon={<Check />} disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(rows, {
                onSuccess: () => toast.success('Subjects saved'), onError: (e) => toast.error(errorMessage(e)),
              })}>Save changes</Button>
              {dirty && <Button variant="ghost" onClick={() => setRows(subjects.data ?? [])}>Discard</Button>}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
