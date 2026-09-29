import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowUpRight, RefreshCw } from 'lucide-react';
import { streamTutor } from '@/lib/functions';
import { errorMessage } from '@/lib/errors';
import { qk } from '@/data/client';
import { useUser } from '@/features/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/States';

const Markdown = lazy(() => import('@/components/Markdown'));

export interface ExplainContext {
  question: string;
  options: string[];
  chosen: string | null;
  correct: string;
  explanation?: string;
  subjectKey: string;
  topicKey: string;
}

/** Streams a tutor explanation of a wrong answer, inline. */
export function InlineExplain({ ctx }: { ctx: ExplainContext }) {
  const user = useUser();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'streaming' | 'done' | 'error'>('streaming');
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    abortRef.current = ac;
    setText('');
    setStatus('streaming');
    setError(null);
    streamTutor({
      mode: 'mistake',
      subject_key: ctx.subjectKey,
      topic_key: ctx.topicKey,
      message: 'Why is my answer wrong?',
      question: { question: ctx.question, options: ctx.options, chosen: ctx.chosen, correct: ctx.correct, explanation: ctx.explanation },
    }, {
      onMeta: (m) => setConversationId(m.conversation_id),
      onDelta: (t) => setText((s) => s + t),
    }, ac.signal)
      .then(() => {
        setStatus('done');
        qc.invalidateQueries({ queryKey: qk.conversations(user.id) });
        qc.invalidateQueries({ queryKey: qk.allowance(user.id, 'tutor_message') });
      })
      .catch((e) => {
        if ((e as Error)?.name === 'AbortError') return;
        setStatus('error');
        setError(errorMessage(e));
      });
    return () => ac.abort();
  }, [ctx, attempt, qc, user.id]);

  return (
    <div className="inline-explain" aria-live="polite" aria-busy={status === 'streaming'}>
      {status === 'error' ? (
        <Alert tone="danger" icon={<AlertCircle />}>
          <p>{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw />} className="mt-2" onClick={() => setAttempt((a) => a + 1)}>Try again</Button>
        </Alert>
      ) : text ? (
        <Suspense fallback={<p className="text-2">{text}</p>}>
          <Markdown>{text}</Markdown>
        </Suspense>
      ) : (
        <p className="text-2 row-sm"><span className="spinner" aria-hidden="true" /> The tutor is thinking…</p>
      )}
      {status === 'done' && conversationId && (
        <Link to={`/tutor/${conversationId}`} className="section__link mt-3" style={{ display: 'inline-flex' }}>
          Continue this in the tutor <ArrowUpRight aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
