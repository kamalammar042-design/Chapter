import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { ArrowRight, CheckCircle2, Sparkles, XCircle, AlertCircle } from 'lucide-react';
import { getSubject, getTopic, subjectLabel } from '@/content/catalog';
import { WRITTEN_MAP } from '@/content/extras';
import type { WrittenQuestion } from '@/content/written';
import { useProfile } from '@/data/profile';
import { Page, PageHeader, useTitle } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/States';
import { streamTutor } from '@/lib/functions';
import { errorMessage } from '@/lib/errors';
import { gradeWritten, type WrittenResult } from './written-grading';

const Markdown = lazy(() => import('@/components/Markdown'));

export default function Written() {
  const [sp] = useSearchParams();
  const subjectKey = sp.get('subject') ?? '';
  const subject = getSubject(subjectKey);
  useTitle('Written answers');
  const profile = useProfile();
  const [all, setAll] = useState<WrittenQuestion[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [i, setI] = useState(0);
  const [text, setText] = useState('');
  const [result, setResult] = useState<WrittenResult | null>(null);
  const [feedback, setFeedback] = useState('');
  const [fbState, setFbState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [fbError, setFbError] = useState<string | null>(null);

  useEffect(() => { import('@/content/written').then((m) => setAll(m.WRITTEN)).catch(setLoadError); }, []);

  const questions = useMemo(() => {
    const entry = Object.entries(WRITTEN_MAP).find(([, v]) => v.subject === subjectKey);
    if (!entry || !all) return [];
    const id = Number(entry[0]);
    const tier = profile.data?.igcse_tier;
    return all.filter((q) => q.subjectId === id && (!q.levels || q.levels.includes('foundation')) && !(tier === 'core' && q.diff === 'hard'));
  }, [all, subjectKey, profile.data]);

  if (!subject) return <Navigate to="/study" replace />;
  if (loadError) return <Page><ErrorState error={loadError} /></Page>;
  if (!all) return <Page><PageLoader /></Page>;
  if (!questions.length) return <Page width="narrow"><EmptyState title="No written questions for this subject yet" actions={<Link to={`/study/${subjectKey}`} className="btn btn--secondary">Back</Link>} /></Page>;

  const q = questions[i % questions.length];
  const topicKey = WRITTEN_MAP[q.subjectId]?.topics[q.topic];
  const topicName = topicKey ? getTopic(subjectKey, topicKey)?.name : q.topic;

  const askTutor = async () => {
    setFbState('loading');
    setFeedback('');
    setFbError(null);
    try {
      await streamTutor({
        mode: 'check', subject_key: subjectKey, topic_key: topicKey ?? null,
        message: `Please mark my written answer as an examiner would and tell me how to improve it.\n\n**Question:** ${q.q}\n\n**My answer:** ${text.trim()}`,
      }, { onDelta: (t) => setFeedback((f) => f + t) });
      setFbState('done');
    } catch (e) {
      setFbState('error');
      setFbError(errorMessage(e));
    }
  };

  const nextQ = () => { setI((n) => n + 1); setText(''); setResult(null); setFeedback(''); setFbState('idle'); };

  return (
    <Page width="narrow">
      <PageHeader back={{ to: `/study/${subjectKey}`, label: subjectLabel(subject) }} title="Written answers"
        subtitle="Write a short answer in your own words. You'll get an instant check of the key ideas, and the tutor can mark it in detail." />
      <Card>
        <p className="text-sm text-3 fw-500">{topicName} · Question {(i % questions.length) + 1} of {questions.length}</p>
        <h2 className="text-lg fw-600 mt-2">{q.q}</h2>
        {q.prompt && <p className="text-sm text-2 mt-2">{q.prompt}</p>}
      </Card>
      <div className="mt-4">
        <Field label="Your answer">
          <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} disabled={!!result} maxLength={3000} />
        </Field>
      </div>
      {!result ? (
        <Button className="mt-4" onClick={() => setResult(gradeWritten(q, text))} disabled={!text.trim()}>Check my answer</Button>
      ) : (
        <Card className="mt-4 stack">
          <div className="row row--between">
            <p className={`fw-600 ${result.pass ? 'text-success' : 'text-warning'}`}>{result.pass ? 'Covers the key ideas' : 'Some key ideas are missing'}</p>
            <span className="text-sm text-3 num">{result.checks.filter((c) => c.ok).length}/{result.checks.length} checks</span>
          </div>
          <ul className="stack-sm" style={{ listStyle: 'none' }}>
            {result.checks.map((c) => (
              <li key={c.label} className="row-sm text-sm">
                {c.ok ? <CheckCircle2 size={16} className="text-success" aria-label="Met" /> : <XCircle size={16} className="text-danger" aria-label="Not met" />}
                <span className="text-2">{c.label}</span>
              </li>
            ))}
          </ul>
          {q.sampleAnswer && (
            <div className="model-answer">
              <p className="text-xs text-3 fw-600">MODEL ANSWER</p>
              <p className="mt-1">{q.sampleAnswer}</p>
              {q.exp && <p className="text-sm text-2 mt-2">{q.exp}</p>}
            </div>
          )}
          <p className="text-xs text-3">The instant check looks for key ideas and form; it can't judge quality. Ask the tutor for proper marking.</p>
          {fbState === 'idle' && <Button variant="secondary" icon={<Sparkles />} onClick={askTutor}>Get tutor feedback</Button>}
          {fbState === 'loading' && !feedback && <p className="text-sm text-2 row-sm"><span className="spinner" aria-hidden="true" /> Marking your answer…</p>}
          {feedback && <div className="inline-explain"><Suspense fallback={<p>{feedback}</p>}><Markdown>{feedback}</Markdown></Suspense></div>}
          {fbState === 'error' && <Alert tone="danger" icon={<AlertCircle />}>{fbError}</Alert>}
          <Button iconRight={<ArrowRight />} onClick={nextQ}>Next question</Button>
        </Card>
      )}
    </Page>
  );
}
