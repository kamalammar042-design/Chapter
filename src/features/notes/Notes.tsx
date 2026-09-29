import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { NotebookPen, Plus, Search } from 'lucide-react';
import { getSubject, getTopic, subjectLabel } from '@/content/catalog';
import { useCreateNote, useNotes } from '@/data/study';
import { useStudentSubjects } from '@/data/profile';
import { Page, PageHeader, useTitle } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { SubjectIcon } from '@/components/SubjectIcon';
import { relativeTime } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';

export default function Notes() {
  useTitle('Notes');
  const notes = useNotes();
  const subjects = useStudentSubjects();
  const create = useCreateNote();
  const navigate = useNavigate();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (notes.data ?? []).filter((n) => (!subject || n.subject_key === subject) && (!q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)));
  }, [notes.data, query, subject]);

  const newNote = () => create.mutate({ title: '', body: '', subject_key: subject || null }, {
    onSuccess: (n) => navigate(`/notes/${n.id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Page>
      <PageHeader title="Notes" subtitle="Write revision notes, then highlight anything to have the tutor explain it or turn it into flashcards."
        actions={<Button icon={<Plus />} onClick={newNote} loading={create.isPending}>New note</Button>} />

      {(notes.data?.length ?? 0) > 0 && (
        <div className="filters mb-4">
          <div className="input-wrap grow" style={{ minWidth: 200 }}>
            <Input type="search" placeholder="Search notes" aria-label="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} />
            <span className="input-wrap__btn" aria-hidden="true" style={{ pointerEvents: 'none' }}><Search /></span>
          </div>
          <Select aria-label="Filter by subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">All subjects</option>
            {(subjects.data ?? []).map((s) => { const sub = getSubject(s.subject_key); return sub ? <option key={s.subject_key} value={s.subject_key}>{subjectLabel(sub)}</option> : null; })}
          </Select>
        </div>
      )}

      {notes.isLoading ? (
        <div className="grid-auto">{[0, 1, 2].map((i) => <Skeleton key={i} height={130} radius={14} />)}</div>
      ) : notes.error ? (
        <ErrorState error={notes.error} onRetry={() => notes.refetch()} />
      ) : filtered.length ? (
        <div className="grid-auto">
          {filtered.map((n) => (
            <Link key={n.id} to={`/notes/${n.id}`} className="card card--interactive note-card">
              <div className="row-sm mb-2">
                {n.subject_key && <SubjectIcon subjectKey={n.subject_key} size="sm" />}
                <p className="fw-600 truncate grow">{n.title || 'Untitled note'}</p>
              </div>
              {n.subject_key && n.topic_key && <p className="text-xs text-3 mb-1">{getTopic(n.subject_key, n.topic_key)?.name}</p>}
              <p className="note-card__preview text-sm text-2">{n.body.slice(0, 220) || 'Empty note'}</p>
              <p className="text-xs text-3 mt-3">Edited {relativeTime(n.updated_at)}</p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={<NotebookPen />} title={notes.data?.length ? 'No notes match' : 'No notes yet'}
          body={notes.data?.length ? 'Try a different search.' : 'Summarise a topic in your own words. It is one of the best ways to remember it.'}
          actions={!notes.data?.length && <Button icon={<Plus />} onClick={newNote} loading={create.isPending}>Write your first note</Button>} />
      )}
    </Page>
  );
}
