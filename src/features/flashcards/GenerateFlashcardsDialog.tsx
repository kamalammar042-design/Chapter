import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Trash2, Wand2 } from 'lucide-react';
import { getSubject, subjectLabel } from '@/content/catalog';
import { useStudentSubjects } from '@/data/profile';
import { useAiAllowance } from '@/data/progress';
import { useCreateDeck } from '@/data/study';
import { qk } from '@/data/client';
import { useUser } from '@/features/auth/AuthProvider';
import { Dialog } from '@/components/ui/Dialog';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { invokeFunction } from '@/lib/functions';
import { errorMessage, toAppError } from '@/lib/errors';
import { dedupeCards } from '@/lib/cards';

interface Card { front: string; back: string }

/**
 * Generates a deck with AI from a topic or from the student's own text,
 * shows every card for review, and saves only what the student keeps.
 */
export function GenerateFlashcardsDialog({ sourceText, subjectKey: initialSubject, defaultTitle, source, onClose }: {
  sourceText?: string | null; subjectKey?: string | null; defaultTitle?: string; source: 'ai' | 'note'; onClose: () => void;
}) {
  const user = useUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const subjects = useStudentSubjects();
  const allowance = useAiAllowance('generate');
  const createDeck = useCreateDeck();
  const [subjectKey, setSubjectKey] = useState(initialSubject ?? subjects.data?.[0]?.subject_key ?? '');
  const [topicKey, setTopicKey] = useState('');
  const [count, setCount] = useState<'8' | '12' | '20'>('12');
  const [cards, setCards] = useState<Card[] | null>(null);
  const [title, setTitle] = useState(defaultTitle ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subject = getSubject(subjectKey);

  const generate = async () => {
    if (!subjectKey) return setError('Choose a subject.');
    setBusy(true);
    setError(null);
    try {
      const res = await invokeFunction<{ cards: Card[] }>('ai-generate', {
        kind: 'flashcards', subject_key: subjectKey, topic_key: topicKey || null, count: Number(count), source_text: sourceText || null,
      }, { timeoutMs: 120_000 });
      setCards(dedupeCards(res.cards).kept);
      if (!title) setTitle(topicKey ? subject?.topics.find((t) => t.key === topicKey)?.name ?? 'AI deck' : subject ? subjectLabel(subject) : 'AI deck');
      qc.invalidateQueries({ queryKey: qk.allowance(user.id, 'generate') });
    } catch (e) {
      const err = toAppError(e);
      setError(err.code === 'upgrade_required' ? 'AI flashcards are not available on this account.' : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveDeck = () => {
    if (!cards?.length) return;
    createDeck.mutate({ title: (title.trim() || 'AI deck').slice(0, 80), subject_key: subjectKey || null, source, cards: cards.map((c) => ({ ...c, topic_key: topicKey || null, source_kind: source })) }, {
      onSuccess: (deck) => { toast.success(`Saved ${cards.length} cards`); onClose(); navigate(`/flashcards/${deck.id}`); },
      onError: (e) => setError(errorMessage(e)),
    });
  };

  const a = allowance.data;
  return (
    <Dialog open onClose={onClose} busy={busy || createDeck.isPending} wide
      title={cards ? 'Review your new cards' : 'Generate flashcards with AI'}
      description={cards ? 'Remove anything you don’t want, then save the deck.' : sourceText ? 'Cards will be based only on the text you selected.' : 'Cards cover the facts and definitions examiners ask about most.'}
      footer={cards ? <>
        <Button variant="ghost" onClick={() => setCards(null)} disabled={createDeck.isPending}>Start over</Button>
        <Button onClick={saveDeck} loading={createDeck.isPending} disabled={!cards.length}>Save {cards.length} cards</Button>
      </> : <>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button icon={<Wand2 />} onClick={generate} loading={busy} disabled={a ? !a.allowed : false}>{busy ? 'Writing cards…' : 'Generate'}</Button>
      </>}>
      {error && <Alert tone="danger" icon={<AlertCircle />}>{error}</Alert>}
      {!cards ? (
        <>
          <div className="grid-2">
            <Field label="Subject">
              <Select value={subjectKey} onChange={(e) => { setSubjectKey(e.target.value); setTopicKey(''); }}>
                <option value="">Choose…</option>
                {(subjects.data ?? []).map((s) => { const sub = getSubject(s.subject_key); return sub ? <option key={s.subject_key} value={s.subject_key}>{subjectLabel(sub)}</option> : null; })}
              </Select>
            </Field>
            {!sourceText && (
              <Field label="Topic" optional>
                <Select value={topicKey} onChange={(e) => setTopicKey(e.target.value)} disabled={!subject}>
                  <option value="">Whole subject</option>
                  {subject?.topics.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
          <Segmented label="Number of cards" value={count} onChange={setCount} options={[{ value: '8', label: '8 cards' }, { value: '12', label: '12 cards' }, { value: '20', label: '20 cards' }]} />
          {a && <p className="text-xs text-3">{a.allowed ? `${a.remaining} generation${a.remaining === 1 ? '' : 's'} left this month.` : a.reason === 'upgrade_required' ? 'AI generation is not available on this account.' : 'You have used this month’s generations.'}</p>}
          {busy && <p className="text-sm text-2" role="status">This usually takes 10–30 seconds.</p>}
        </>
      ) : (
        <>
          <Field label="Deck name"><Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></Field>
          <ul className="card-preview" aria-label="Generated cards">
            {cards.map((c, i) => (
              <li key={`${c.front}-${i}`} className="card-preview__item">
                <div className="grow">
                  <p className="fw-600 text-sm">{c.front}</p>
                  <p className="text-sm text-2 mt-1">{c.back}</p>
                </div>
                <IconButton label={`Remove card ${i + 1}`} icon={<Trash2 />} size="sm" onClick={() => setCards((xs) => xs!.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}
