import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Layers, Plus, Wand2, Play } from 'lucide-react';
import { useCreateDeck, useDecks } from '@/data/study';
import { useStudentSubjects } from '@/data/profile';
import { getSubject, subjectLabel } from '@/content/catalog';
import { Page, PageHeader, useTitle } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { SubjectIcon } from '@/components/SubjectIcon';
import { errorMessage } from '@/lib/errors';
import { GenerateFlashcardsDialog } from './GenerateFlashcardsDialog';

export default function Flashcards() {
  useTitle('Flashcards');
  const decks = useDecks();
  const subjects = useStudentSubjects();
  const create = useCreateDeck();
  const toast = useToast();
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const due = (decks.data ?? []).reduce((s, d) => s + d.due, 0);
  const total = (decks.data ?? []).reduce((s, d) => s + d.total, 0);

  return (
    <Page>
      <PageHeader title="Flashcards" subtitle="Spaced repetition shows each card just before you'd forget it. A few minutes a day beats cramming."
        actions={<>
          <Button variant="secondary" icon={<Plus />} onClick={() => setNewOpen(true)}>New deck</Button>
          <Button icon={<Wand2 />} onClick={() => setGenOpen(true)}>Generate with AI</Button>
        </>} />

      {total > 0 && (
        <Card accent className="row row--between row--wrap mb-6">
          <div>
            <p className="fw-600 text-md">{due ? `${due} card${due === 1 ? '' : 's'} due for review` : 'All caught up'}</p>
            <p className="text-sm text-2">{due ? 'Reviewing now keeps them in long-term memory.' : 'Come back later. Cards reappear when they are due.'}</p>
          </div>
          {due > 0 && <ButtonLink to="/review" icon={<Play />}>Review now</ButtonLink>}
        </Card>
      )}

      {decks.isLoading ? (
        <div className="grid-auto">{[0, 1, 2].map((i) => <Skeleton key={i} height={110} radius={14} />)}</div>
      ) : decks.error ? (
        <ErrorState error={decks.error} onRetry={() => decks.refetch()} />
      ) : decks.data?.length ? (
        <div className="grid-auto">
          {decks.data.map((d) => (
            <Link key={d.id} to={`/flashcards/${d.id}`} className="card card--interactive">
              <div className="row">
                {d.subject_key ? <SubjectIcon subjectKey={d.subject_key} /> : <span className="subject-icon" aria-hidden="true"><Layers /></span>}
                <div className="grow" style={{ minWidth: 0 }}>
                  <p className="fw-600 truncate">{d.title}</p>
                  <p className="text-xs text-3">{d.total} card{d.total === 1 ? '' : 's'}{d.source === 'ai' ? ' · AI' : d.source === 'note' ? ' · from notes' : ''}</p>
                </div>
                {d.due > 0 && <Badge tone="primary">{d.due} due</Badge>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Layers />} title="No decks yet" body="Create cards yourself, or let the AI write a deck for any topic in seconds."
          actions={<><Button variant="secondary" icon={<Plus />} onClick={() => setNewOpen(true)}>New deck</Button><Button icon={<Wand2 />} onClick={() => setGenOpen(true)}>Generate with AI</Button></>} />
      )}

      <Dialog open={newOpen} onClose={() => setNewOpen(false)} title="New deck" busy={create.isPending}
        footer={<>
          <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button>
          <Button loading={create.isPending} disabled={!title.trim()} onClick={() => create.mutate({ title: title.trim(), subject_key: subject || null, source: 'manual' }, {
            onSuccess: (d) => { setNewOpen(false); setTitle(''); navigate(`/flashcards/${d.id}`); },
            onError: (e) => toast.error(errorMessage(e)),
          })}>Create deck</Button>
        </>}>
        <Field label="Deck name"><Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} data-autofocus placeholder="e.g. Organic chemistry reactions" /></Field>
        <Field label="Subject" optional>
          <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">None</option>
            {(subjects.data ?? []).map((s) => { const sub = getSubject(s.subject_key); return sub ? <option key={s.subject_key} value={s.subject_key}>{subjectLabel(sub)}</option> : null; })}
          </Select>
        </Field>
      </Dialog>
      {genOpen && <GenerateFlashcardsDialog source="ai" onClose={() => setGenOpen(false)} />}
    </Page>
  );
}
