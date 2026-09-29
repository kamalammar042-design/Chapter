import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { SUBJECTS, getSubject, subjectLabel } from '@/content/catalog';
import { skillsFor } from '@/content/skills';
import { difficultyLabel } from '@/content/engine';
import { useQuestionStats, useSaveQuestion, type AdminQuestion, type QuestionPatch, type QuestionStatus } from '@/data/admin';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Alert } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const SOURCE_TYPES = ['owned', 'licensed', 'open_license', 'generated', 'user_uploaded'];
const COPYRIGHT = ['owned', 'licensed', 'open', 'generated', 'user_provided', 'restricted', 'unknown'];

interface Draft {
  subject_key: string; topic_key: string; skill_id: string; stem: string; options: string[]; correct_index: number;
  explanation: string; hint: string; difficulty: number; tier: 'all' | 'core' | 'extended';
  source_type: string; source_name: string; source_url: string; license: string; copyright_status: string; syllabus_version: string; review_note: string;
}

function toDraft(q: AdminQuestion | null): Draft {
  return {
    subject_key: q?.subject_key ?? SUBJECTS[0].key,
    topic_key: q?.topic_key ?? SUBJECTS[0].topics[0].key,
    skill_id: q?.skill_id ?? '',
    stem: q?.stem ?? '',
    options: q?.options.map((o) => o.text) ?? ['', '', '', ''],
    correct_index: q?.correct_index ?? 0,
    explanation: q?.explanation ?? '',
    hint: q?.hint ?? '',
    difficulty: q?.difficulty ?? 3,
    tier: q?.tier ?? 'all',
    source_type: q?.source_type ?? 'owned',
    source_name: q?.source_name ?? 'Chapter editorial team',
    source_url: q?.source_url ?? '',
    license: q?.license ?? 'Proprietary: Chapter',
    copyright_status: q?.copyright_status ?? 'owned',
    syllabus_version: q?.syllabus_version ?? '',
    review_note: q?.review_note ?? '',
  };
}

/** Client-side checks mirroring the server's publish guard, so problems show before saving. */
function draftProblems(d: Draft): string[] {
  const p: string[] = [];
  if (d.stem.trim().length < 10) p.push('The question needs at least 10 characters.');
  const opts = d.options.map((o) => o.trim());
  if (opts.length < 2 || opts.some((o) => !o)) p.push('Every option needs text.');
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) p.push('Two options are the same.');
  if (opts.some((o) => /\b(NaN|undefined|Infinity|null)\b/.test(o))) p.push('An option contains an invalid value.');
  if (d.correct_index < 0 || d.correct_index >= opts.length) p.push('Choose the correct option.');
  if (!d.skill_id) p.push('Choose a skill (required to publish).');
  if (['restricted', 'unknown'].includes(d.copyright_status)) p.push(`Copyright status "${d.copyright_status}" can never be published.`);
  if (['licensed', 'open_license'].includes(d.source_type) && !/^https:\/\//.test(d.source_url)) p.push('Licensed or openly licensed content needs an https source URL.');
  if (d.source_name.trim().length < 2 || d.license.trim().length < 2) p.push('Source name and licence are required.');
  return p;
}

export function QuestionEditor({ question, onClose }: { question: AdminQuestion | null; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveQuestion();
  const stats = useQuestionStats(question?.id ?? null);
  const [d, setD] = useState<Draft>(() => toDraft(question));
  useEffect(() => setD(toDraft(question)), [question]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const subject = getSubject(d.subject_key);
  const skills = useMemo(() => skillsFor(d.subject_key, d.topic_key), [d.subject_key, d.topic_key]);
  const problems = draftProblems(d);
  const procedural = question?.question_type === 'procedural';

  const submit = (status?: QuestionStatus) => {
    const patch: QuestionPatch & { subject_key?: string } = {
      topic_key: d.topic_key,
      skill_id: d.skill_id || null,
      stem: d.stem.trim(),
      explanation: d.explanation.trim(),
      hint: d.hint.trim() || null,
      difficulty: d.difficulty,
      tier: d.tier,
      source_type: d.source_type,
      source_name: d.source_name.trim(),
      source_url: d.source_url.trim() || null,
      license: d.license.trim(),
      copyright_status: d.copyright_status,
      syllabus_version: d.syllabus_version.trim() || null,
      review_note: d.review_note.trim() || null,
    };
    if (!procedural) {
      // keep misconception links on options whose text did not change
      patch.options = d.options.map((text, i) => {
        const prev = question?.options[i];
        return prev && prev.text === text.trim() && prev.misconception_id ? { text: text.trim(), misconception_id: prev.misconception_id } : { text: text.trim() };
      });
      patch.correct_index = d.correct_index;
    }
    if (!question) patch.subject_key = d.subject_key;
    if (status) patch.status = status;
    else if (!question) patch.status = 'draft';
    save.mutate({ id: question?.id ?? null, patch }, {
      onSuccess: () => { toast.success(status === 'published' ? 'Published' : status ? `Marked ${status.replace('_', ' ')}` : 'Saved'); onClose(); },
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  const counts = stats.data?.option_counts ?? [];
  const totalChosen = counts.reduce((s, n) => s + n, 0);

  return (
    <Dialog open onClose={onClose} wide busy={save.isPending}
      title={question ? `Edit question · v${question.version}` : 'New question'}
      description={question ? `${question.status.replace('_', ' ')} · ${question.source_type} · updated ${new Date(question.updated_at).toLocaleDateString()}` : 'New questions start as drafts. Publish when provenance and the answer are confirmed.'}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        {question && question.status !== 'archived' && <Button variant="ghost" onClick={() => submit('archived')}>Archive</Button>}
        {question && ['pending_review', 'draft'].includes(question.status) && <Button variant="danger" onClick={() => submit('rejected')}>Reject</Button>}
        <Button variant="secondary" onClick={() => submit()} loading={save.isPending}>Save</Button>
        {question?.status !== 'published' && <Button onClick={() => submit('published')} disabled={problems.length > 0} loading={save.isPending}>Approve and publish</Button>}
      </>}>
      <div className="stack">
        {question?.validation?.checks && (
          <div className="stack-sm">
            <p className="field__label">Validation {question.validation.passed ? <Badge tone="success">passed</Badge> : <Badge tone="warning">needs review</Badge>}</p>
            <ul className="check-list">
              {question.validation.checks.map((c, i) => (
                <li key={i} className={c.ok ? 'text-success' : c.severity === 'hard' ? 'text-danger' : 'text-warning'}>
                  {c.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : c.severity === 'hard' ? <XCircle size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
                  <span>{c.name}{c.detail ? `: ${c.detail}` : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {question?.review_note && <Alert tone="warning" icon={<AlertTriangle />}>{question.review_note}</Alert>}

        <div className="grid-3">
          <Field label="Subject">
            <Select value={d.subject_key} disabled={!!question} onChange={(e) => { const s = getSubject(e.target.value)!; setD((x) => ({ ...x, subject_key: s.key, topic_key: s.topics[0].key, skill_id: '' })); }}>
              {SUBJECTS.map((s) => <option key={s.key} value={s.key}>{subjectLabel(s)} ({s.program.toUpperCase()})</option>)}
            </Select>
          </Field>
          <Field label="Topic">
            <Select value={d.topic_key} onChange={(e) => setD((x) => ({ ...x, topic_key: e.target.value, skill_id: '' }))}>
              {(subject?.topics ?? []).map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Skill">
            <Select value={d.skill_id} onChange={(e) => set('skill_id', e.target.value)}>
              <option value="">Choose a skill</option>
              {skills.map((s) => <option key={s.key} value={`${d.subject_key}/${d.topic_key}/${s.key}`}>{s.name}</option>)}
            </Select>
          </Field>
        </div>

        {procedural ? (
          <Alert tone="info">This is a procedural family ({question?.template_key}). Its questions are generated and checked by code; only metadata can be edited here.</Alert>
        ) : (
          <>
            <Field label="Question">
              <Textarea rows={4} maxLength={2000} value={d.stem} onChange={(e) => set('stem', e.target.value)} />
            </Field>
            <fieldset className="stack-sm">
              <legend className="field__label">Options (select the correct one)</legend>
              {d.options.map((o, i) => (
                <div key={i} className="row-sm">
                  <input type="radio" name="correct" checked={d.correct_index === i} onChange={() => set('correct_index', i)} aria-label={`Option ${LETTERS[i]} is correct`} />
                  <Input aria-label={`Option ${LETTERS[i]}`} value={o} maxLength={400} onChange={(e) => set('options', d.options.map((x, j) => (j === i ? e.target.value : x)))} />
                  {totalChosen > 0 && <span className="text-xs text-3 num" style={{ minWidth: 48 }}>{Math.round(((counts[i] ?? 0) / totalChosen) * 100)}%</span>}
                </div>
              ))}
              {d.options.length < 6 && <Button size="sm" variant="ghost" onClick={() => set('options', [...d.options, ''])}>Add option</Button>}
            </fieldset>
            <Field label="Explanation"><Textarea rows={3} maxLength={3000} value={d.explanation} onChange={(e) => set('explanation', e.target.value)} /></Field>
            <Field label="Hint" optional><Input maxLength={600} value={d.hint} onChange={(e) => set('hint', e.target.value)} /></Field>
          </>
        )}

        <div className="grid-3">
          <Field label="Difficulty">
            <Select value={d.difficulty} onChange={(e) => set('difficulty', Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {difficultyLabel(n)}</option>)}
            </Select>
          </Field>
          <Field label="Tier">
            <Select value={d.tier} onChange={(e) => set('tier', e.target.value as Draft['tier'])}>
              <option value="all">All students</option><option value="core">Core</option><option value="extended">Extended only</option>
            </Select>
          </Field>
          <Field label="Syllabus version" optional><Input value={d.syllabus_version} maxLength={40} onChange={(e) => set('syllabus_version', e.target.value)} placeholder="e.g. 2026-2028" /></Field>
        </div>

        <fieldset className="stack-sm">
          <legend className="field__label">Provenance</legend>
          <div className="grid-3">
            <Field label="Source type">
              <Select value={d.source_type} onChange={(e) => set('source_type', e.target.value)}>{SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
            </Field>
            <Field label="Copyright status">
              <Select value={d.copyright_status} onChange={(e) => set('copyright_status', e.target.value)}>{COPYRIGHT.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
            </Field>
            <Field label="Licence"><Input value={d.license} maxLength={200} onChange={(e) => set('license', e.target.value)} /></Field>
          </div>
          <div className="grid-2">
            <Field label="Source name"><Input value={d.source_name} maxLength={200} onChange={(e) => set('source_name', e.target.value)} /></Field>
            <Field label="Source URL" optional><Input type="url" value={d.source_url} onChange={(e) => set('source_url', e.target.value)} placeholder="https://" /></Field>
          </div>
        </fieldset>

        {stats.data && (
          <p className="text-sm text-2">
            {stats.data.attempts} attempts · {stats.data.attempts ? Math.round((stats.data.correct / stats.data.attempts) * 100) : 0}% correct ·
            {' '}{stats.data.attempts ? Math.round(stats.data.total_time_ms / stats.data.attempts / 1000) : 0}s average · {stats.data.skips} skips · {stats.data.hint_uses} with hints
          </p>
        )}
        <Field label="Review note" optional><Input value={d.review_note} maxLength={1000} onChange={(e) => set('review_note', e.target.value)} /></Field>
        {problems.length > 0 && (
          <Alert tone="warning" icon={<AlertTriangle />}>
            <p className="fw-600">Cannot publish yet</p>
            <ul style={{ paddingLeft: 18 }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
