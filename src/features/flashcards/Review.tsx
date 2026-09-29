import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Layers, RotateCcw } from 'lucide-react';
import { reviewCard, useDeckCards, useDueCards } from '@/data/study';
import { qk } from '@/data/client';
import { useUser } from '@/features/auth/AuthProvider';
import { Page, useTitle } from '@/components/layout/Page';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/Progress';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';
import type { Flashcard } from '@/lib/types';

const GRADES: Array<{ grade: 0 | 1 | 2 | 3; label: string; hint: string; key: string }> = [
  { grade: 0, label: 'Again', hint: 'Forgot', key: '1' },
  { grade: 1, label: 'Hard', hint: 'Struggled', key: '2' },
  { grade: 2, label: 'Good', hint: 'Remembered', key: '3' },
  { grade: 3, label: 'Easy', hint: 'Instant', key: '4' },
];

export default function Review() {
  useTitle('Review flashcards');
  const [sp] = useSearchParams();
  const deckId = sp.get('deck') ?? undefined;
  const studyAll = sp.get('all') === '1';
  const due = useDueCards(deckId);
  const all = useDeckCards(studyAll ? deckId : undefined);
  const source = studyAll ? all : due;
  const [queue, setQueue] = useState<Flashcard[] | null>(null);

  useEffect(() => {
    if (source.data && queue === null) setQueue(source.data);
  }, [source.data, queue]);

  if (source.isLoading || (source.data && queue === null)) return <Page><PageLoader /></Page>;
  if (source.error) return <Page><ErrorState error={source.error} onRetry={() => source.refetch()} /></Page>;
  if (!queue?.length) {
    return (
      <Page width="narrow">
        <h1 className="sr-only">Flashcard review</h1>
        <EmptyState icon={<CheckCircle2 />} title="Nothing due right now"
          body="You're up to date. Cards come back when they're due, and the best time to review is just before you'd forget."
          actions={<><ButtonLink to="/flashcards" variant="secondary">All decks</ButtonLink><ButtonLink to="/home">Home</ButtonLink></>} />
      </Page>
    );
  }
  return <ReviewSession cards={queue} />;
}

function ReviewSession({ cards }: { cards: Flashcard[] }) {
  const user = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const [queue, setQueue] = useState(cards);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [busy, setBusy] = useState(false);
  const card = queue[0];
  const total = cards.length;

  const grade = useCallback(async (g: 0 | 1 | 2 | 3) => {
    if (!card || busy) return;
    setBusy(true);
    try {
      await reviewCard(card.id, g);
      setReviewed((n) => n + 1);
      // "Again" cards come back at the end of this session
      setQueue((q) => (g === 0 ? [...q.slice(1), q[0]] : q.slice(1)));
      setFlipped(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [card, busy, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped((f) => !f); return; }
      if (!flipped) return;
      const g = GRADES.find((x) => x.key === e.key);
      if (g) { e.preventDefault(); void grade(g.grade); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, grade]);

  useEffect(() => {
    if (!card) {
      for (const k of [qk.decks(user.id), qk.dueCards(user.id), qk.activity(user.id), qk.profile(user.id)]) qc.invalidateQueries({ queryKey: k });
    }
  }, [card, qc, user.id]);

  if (!card) {
    return (
      <Page width="narrow">
        <h1 className="sr-only">Flashcard review</h1>
        <EmptyState icon={<CheckCircle2 />} title="Session complete" body={`You reviewed ${reviewed} card${reviewed === 1 ? '' : 's'}. Each one is now scheduled for the right moment.`}
          actions={<><ButtonLink to="/flashcards" variant="secondary">All decks</ButtonLink><ButtonLink to="/home">Home</ButtonLink></>} />
      </Page>
    );
  }

  return (
    <Page width="narrow">
      <h1 className="text-lg fw-600 mb-4">Flashcard review</h1>
      <div className="row mb-6">
        <Layers size={18} className="text-3" aria-hidden="true" />
        <div className="grow"><ProgressBar value={Math.min(reviewed, total)} max={total} label="Review progress" /></div>
        <span className="text-sm text-3 num">{Math.min(reviewed, total)} / {total}</span>
      </div>

      <button type="button" className={`flashcard${flipped ? ' is-flipped' : ''}`} onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? 'Answer shown. Activate to show the question.' : 'Question. Activate to reveal the answer.'}>
        <span className="flashcard__side text-xs text-3 fw-600">{flipped ? 'ANSWER' : 'QUESTION'}</span>
        <span className="flashcard__text">{flipped ? card.back : card.front}</span>
        {!flipped && <span className="text-xs text-3">Tap or press Space to reveal</span>}
      </button>
      <p className="sr-only" aria-live="polite">{flipped ? `Answer: ${card.back}` : ''}</p>

      {flipped ? (
        <div className="grade-row mt-6" role="group" aria-label="How well did you remember?">
          {GRADES.map((g) => (
            <button key={g.grade} type="button" className={`grade grade--${g.grade}`} onClick={() => grade(g.grade)} disabled={busy}>
              <span className="fw-600">{g.label}</span>
              <span className="text-xs text-3">{g.hint} <span className="kbd hide-mobile">{g.key}</span></span>
            </button>
          ))}
        </div>
      ) : (
        <Button block size="lg" className="mt-6" icon={<RotateCcw />} onClick={() => setFlipped(true)}>Show answer</Button>
      )}
    </Page>
  );
}
