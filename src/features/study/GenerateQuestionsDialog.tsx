import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, FileUp, Wand2, X } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/States';
import { useAiAllowance } from '@/data/progress';
import { qk } from '@/data/client';
import { useUser } from '@/features/auth/AuthProvider';
import { fileToBase64, invokeFunction } from '@/lib/functions';
import { errorMessage, toAppError } from '@/lib/errors';
import { getTopic } from '@/content/catalog';
import type { PoolRow } from '@/lib/types';
import type { GeneratedSet } from './practiceTypes';

const MAX_PDF = 10 * 1024 * 1024;

export function GenerateQuestionsDialog({ subjectKey, topicKey, onClose }: { subjectKey: string; topicKey: string; onClose: () => void }) {
  const navigate = useNavigate();
  const user = useUser();
  const qc = useQueryClient();
  const allowance = useAiAllowance('generate');
  const [count, setCount] = useState<'5' | '10'>('5');
  const [difficulty, setDifficulty] = useState<'mixed' | '2' | '3' | '4' | '5'>('mixed');
  const [pdf, setPdf] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const topic = getTopic(subjectKey, topicKey);

  const choose = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) return setError('Please choose a PDF file.');
    if (f.size > MAX_PDF) return setError('That PDF is larger than 10 MB. Try a single chapter or a few pages.');
    setPdf(f);
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await invokeFunction<{ ok: true; rows: PoolRow[]; published: number; pending_review: number; rejected: number; remaining: number }>('ai-generate', {
        kind: 'questions',
        subject_key: subjectKey,
        topic_key: topicKey,
        count: Number(count),
        difficulty: difficulty === 'mixed' ? null : Number(difficulty),
        pdf: pdf ? await fileToBase64(pdf) : null,
      }, { timeoutMs: 180_000 });
      qc.invalidateQueries({ queryKey: qk.allowance(user.id, 'generate') });
      if (!res.rows.length) {
        setError(`None of the new questions passed Chapter's checks this time${res.pending_review ? ` (${res.pending_review} will be reviewed by a person)` : ''}. This did not use up a generation. Please try again.`);
        setBusy(false);
        return;
      }
      const set: GeneratedSet = { subjectKey, topicKey, rows: res.rows };
      navigate(`/practice?subject=${subjectKey}&topic=${topicKey}&mode=practice&source=ai&count=${res.rows.length}`, { state: { generated: set } });
    } catch (e) {
      const err = toAppError(e);
      setError(err.code === 'upgrade_required' ? 'AI question generation is not available on this account.' : errorMessage(e));
      setBusy(false);
    }
  };

  const a = allowance.data;
  return (
    <Dialog open onClose={onClose} busy={busy}
      title="Generate new questions"
      description={`Fresh multiple-choice questions on ${topic?.name ?? 'this topic'}, written by AI at your level. A second AI solves each one independently; only questions that pass every check are used.`}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button icon={<Wand2 />} onClick={run} loading={busy} disabled={a ? !a.allowed : false}>{busy ? 'Writing questions…' : 'Generate'}</Button>
      </>}>
      <div className="row row--wrap">
        <Segmented label="Number of questions" value={count} onChange={setCount} options={[{ value: '5', label: '5 questions' }, { value: '10', label: '10 questions' }]} />
        <Segmented label="Difficulty" value={difficulty} onChange={setDifficulty}
          options={[{ value: 'mixed', label: 'Mixed' }, { value: '2', label: 'Developing' }, { value: '3', label: 'Standard' }, { value: '4', label: 'Challenging' }, { value: '5', label: 'Advanced' }]} />
      </div>

      <div className="stack-sm">
        <p className="field__label">Base them on your own material <span className="text-3 fw-500">(optional)</span></p>
        <p className="text-xs text-3">Questions made from your upload are private to you.</p>
        {pdf ? (
          <div className="file-chip">
            <FileUp size={16} aria-hidden="true" />
            <span className="truncate grow">{pdf.name}</span>
            <span className="text-3 text-xs">{(pdf.size / 1024 / 1024).toFixed(1)} MB</span>
            <button type="button" className="btn btn--ghost btn--sm btn--icon" aria-label="Remove file" onClick={() => setPdf(null)} disabled={busy}><X /></button>
          </div>
        ) : (
          <Button variant="secondary" icon={<FileUp />} onClick={() => inputRef.current?.click()} disabled={busy}>Upload notes or a past paper (PDF)</Button>
        )}
        <input ref={inputRef} type="file" accept="application/pdf" hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {a && (
        <p className="text-xs text-3">
          {a.allowed ? `${a.remaining} generation${a.remaining === 1 ? '' : 's'} left this month.`
            : a.reason === 'upgrade_required' ? 'AI generation is not available on this account.' : 'You have used this month’s generations.'}
        </p>
      )}
      {error && <Alert tone="danger" icon={<AlertCircle />}>{error}</Alert>}
      {busy && <p className="text-sm text-2" role="status">Writing and checking questions. This usually takes 20–60 seconds.</p>}
    </Dialog>
  );
}
