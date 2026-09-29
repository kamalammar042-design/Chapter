import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Pencil, Play, Plus, Trash2, Layers } from 'lucide-react';
import { useDecks, useDeckCards, useDeleteCard, useDeleteDeck, useSaveCard } from '@/data/study';
import { Page, PageHeader, useTitle } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Textarea } from '@/components/ui/Field';
import { EmptyState, ErrorState, PageLoader, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';
import { relativeTime } from '@/lib/dates';
import type { Flashcard } from '@/lib/types';

export default function DeckPage() {
  const { deckId } = useParams();
  const decks = useDecks();
  const cards = useDeckCards(deckId);
  const save = useSaveCard();
  const delCard = useDeleteCard();
  const delDeck = useDeleteDeck();
  const toast = useToast();
  const navigate = useNavigate();
  const deck = decks.data?.find((d) => d.id === deckId);
  useTitle(deck?.title ?? 'Deck');
  const [editing, setEditing] = useState<Partial<Flashcard> | null>(null);
  const [confirmDeck, setConfirmDeck] = useState(false);

  if (decks.isLoading) return <Page><PageLoader /></Page>;
  if (decks.error) return <Page><ErrorState error={decks.error} onRetry={() => decks.refetch()} /></Page>;
  if (!deck) return <Page><EmptyState title="Deck not found" actions={<ButtonLink to="/flashcards">All decks</ButtonLink>} /></Page>;

  const submitCard = () => {
    if (!editing?.front?.trim() || !editing.back?.trim()) return;
    save.mutate({ id: editing.id, deck_id: deck.id, front: editing.front.trim(), back: editing.back.trim() }, {
      onSuccess: () => { toast.success(editing.id ? 'Card updated' : 'Card added'); setEditing(editing.id ? null : { front: '', back: '' }); },
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  return (
    <Page width="narrow">
      <PageHeader back={{ to: '/flashcards', label: 'Flashcards' }} title={deck.title}
        subtitle={`${deck.total} card${deck.total === 1 ? '' : 's'} · ${deck.due} due now`}
        actions={<>
          <IconButton label="Delete deck" icon={<Trash2 />} onClick={() => setConfirmDeck(true)} />
          <Button variant="secondary" icon={<Plus />} onClick={() => setEditing({ front: '', back: '' })}>Add card</Button>
          <ButtonLink to={`/review?deck=${deck.id}${deck.due ? '' : '&all=1'}`} icon={<Play />}>{deck.due ? `Review ${deck.due}` : 'Study all'}</ButtonLink>
        </>} />

      <Card flush>
        {cards.isLoading ? <div className="stack" style={{ padding: 20 }}><Skeleton height={48} /><Skeleton height={48} /></div> : cards.error ? (
          <ErrorState compact error={cards.error} onRetry={() => cards.refetch()} />
        ) : cards.data?.length ? (
          <ul className="list list--padded">
            {cards.data.map((c) => (
              <li key={c.id} className="list__item">
                <div className="list__main">
                  <p className="fw-500" style={{ whiteSpace: 'pre-wrap' }}>{c.front}</p>
                  <p className="text-sm text-2 mt-1" style={{ whiteSpace: 'pre-wrap' }}>{c.back}</p>
                  <p className="text-xs text-3 mt-1">{c.last_reviewed_at ? `Reviewed ${relativeTime(c.last_reviewed_at)} · next ${relativeTime(c.due_at)}` : 'New'}</p>
                </div>
                <div className="row-sm">
                  <IconButton label="Edit card" icon={<Pencil />} size="sm" onClick={() => setEditing(c)} />
                  <IconButton label="Delete card" icon={<Trash2 />} size="sm" onClick={() => delCard.mutate({ id: c.id, deck_id: deck.id }, { onError: (e) => toast.error(errorMessage(e)) })} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={<Layers />} title="This deck is empty" body="Add your first card: a question on the front, the answer on the back."
            actions={<Button size="sm" icon={<Plus />} onClick={() => setEditing({ front: '', back: '' })}>Add card</Button>} />
        )}
      </Card>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit card' : 'Add a card'} busy={save.isPending}
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>{editing?.id ? 'Cancel' : 'Done'}</Button>
          <Button loading={save.isPending} disabled={!editing?.front?.trim() || !editing?.back?.trim()} onClick={submitCard}>{editing?.id ? 'Save' : 'Add card'}</Button>
        </>}>
        <Field label="Front" hint="A question or prompt"><Textarea rows={2} maxLength={500} value={editing?.front ?? ''} onChange={(e) => setEditing((x) => ({ ...x, front: e.target.value }))} data-autofocus /></Field>
        <Field label="Back" hint="The answer"><Textarea rows={3} maxLength={2000} value={editing?.back ?? ''} onChange={(e) => setEditing((x) => ({ ...x, back: e.target.value }))} /></Field>
      </Dialog>

      <Dialog open={confirmDeck} onClose={() => setConfirmDeck(false)} title="Delete this deck?" description={`All ${deck.total} cards and their review history will be deleted.`}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmDeck(false)}>Cancel</Button>
          <Button variant="danger" loading={delDeck.isPending} onClick={() => delDeck.mutate(deck.id, { onSuccess: () => navigate('/flashcards', { replace: true }), onError: (e) => toast.error(errorMessage(e)) })}>Delete deck</Button>
        </>} />
    </Page>
  );
}
