import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Check, CloudOff, Layers, Sparkles, Trash2, Loader2 } from 'lucide-react';
import { getSubject, subjectLabel } from '@/content/catalog';
import { useDeleteNote, useNote, useUpdateNote } from '@/data/study';
import { useStudentSubjects } from '@/data/profile';
import { Page, PageHeader, useTitle } from '@/components/layout/Page';
import { Button, IconButton } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { Dialog } from '@/components/ui/Dialog';
import { ErrorState, PageLoader } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';
import { GenerateFlashcardsDialog } from '@/features/flashcards/GenerateFlashcardsDialog';

type SaveState = 'saved' | 'saving' | 'error' | 'dirty';

export default function NoteEditor() {
  const { noteId } = useParams();
  const note = useNote(noteId);
  const subjects = useStudentSubjects();
  const update = useUpdateNote();
  const del = useDeleteNote();
  const navigate = useNavigate();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState<string>('');
  const [topic, setTopic] = useState<string>('');
  const [save, setSave] = useState<SaveState>('saved');
  const [selection, setSelection] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cardsFrom, setCardsFrom] = useState<string | null>(null);
  const loaded = useRef(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useTitle(title || 'Note');

  useEffect(() => {
    if (note.data && !loaded.current) {
      loaded.current = true;
      setTitle(note.data.title);
      setBody(note.data.body);
      setSubject(note.data.subject_key ?? '');
      setTopic(note.data.topic_key ?? '');
    }
  }, [note.data]);

  // debounced autosave
  useEffect(() => {
    if (!loaded.current || !noteId) return;
    if (note.data && title === note.data.title && body === note.data.body && (subject || null) === note.data.subject_key && (topic || null) === (note.data.topic_key ?? null)) return;
    setSave('dirty');
    const t = window.setTimeout(() => {
      setSave('saving');
      update.mutate({ id: noteId, title: title.slice(0, 120), body, subject_key: subject || null, topic_key: subject && topic ? topic : null }, {
        onSuccess: () => setSave('saved'),
        onError: () => setSave('error'),
      });
    }, 800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, subject, topic, noteId]);

  // warn before leaving with unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (save !== 'saved') e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [save]);

  const readSelection = () => {
    const el = bodyRef.current;
    if (!el) return;
    setSelection(el.value.slice(el.selectionStart, el.selectionEnd).trim());
  };

  const explain = () => {
    const s = getSubject(subject);
    navigate(`/tutor${s ? `?subject=${s.key}${topic ? `&topic=${topic}` : ''}` : ''}`, {
      state: { prompt: `From my notes${title ? ` on "${title}"` : ''}, explain this:\n\n"${selection.slice(0, 2000)}"`, mode: 'explain', autoSend: true },
    });
  };

  if (note.isLoading) return <Page><PageLoader /></Page>;
  if (note.error || !note.data) return <Page><ErrorState error={note.error} onRetry={() => note.refetch()} /></Page>;

  return (
    <Page width="reading">
      <PageHeader back={{ to: '/notes', label: 'Notes' }} title={<span className="text-md text-3 fw-500">Edit note</span>}
        actions={<>
          <span className="save-state text-xs text-3" role="status" aria-live="polite">
            {save === 'saving' || save === 'dirty' ? <><Loader2 size={13} className="spin" aria-hidden="true" /> Saving…</>
              : save === 'error' ? <span className="text-danger row-sm"><CloudOff size={13} aria-hidden="true" /> Not saved. Check your connection</span>
              : <><Check size={13} aria-hidden="true" /> Saved</>}
          </span>
          <IconButton label="Delete note" icon={<Trash2 />} onClick={() => setConfirmDelete(true)} />
        </>} />

      <input className="note-title" placeholder="Untitled note" aria-label="Note title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      <div className="row row--wrap mb-4">
        <Select aria-label="Subject" value={subject} onChange={(e) => { setSubject(e.target.value); setTopic(''); }} style={{ maxWidth: 260 }}>
          <option value="">No subject</option>
          {(subjects.data ?? []).map((s) => { const sub = getSubject(s.subject_key); return sub ? <option key={s.subject_key} value={s.subject_key}>{subjectLabel(sub)}</option> : null; })}
        </Select>
        {getSubject(subject) && (
          <Select aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} style={{ maxWidth: 260 }}>
            <option value="">No topic</option>
            {getSubject(subject)!.topics.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </Select>
        )}
        <Button variant="secondary" size="sm" icon={<Layers />} disabled={body.trim().length < 40} onClick={() => setCardsFrom(body)}>Make flashcards</Button>
      </div>

      <div className={`selection-bar${selection.length > 2 ? ' is-visible' : ''}`} aria-hidden={selection.length <= 2}>
        <span className="text-xs text-3 truncate grow">“{selection.slice(0, 80)}{selection.length > 80 ? '…' : ''}”</span>
        <Button size="sm" icon={<Sparkles />} onClick={explain} tabIndex={selection.length > 2 ? 0 : -1}>Explain</Button>
        <Button size="sm" variant="secondary" icon={<Layers />} onClick={() => setCardsFrom(selection)} tabIndex={selection.length > 2 ? 0 : -1}>Flashcards</Button>
      </div>

      <label htmlFor="note-body" className="sr-only">Note</label>
      <textarea
        id="note-body"
        ref={bodyRef}
        className="note-body"
        placeholder="Start writing… Tip: select any text to have the tutor explain it."
        value={body}
        maxLength={100000}
        onChange={(e) => setBody(e.target.value)}
        onSelect={readSelection}
        onKeyUp={readSelection}
        onMouseUp={readSelection}
      />

      {cardsFrom !== null && (
        <GenerateFlashcardsDialog sourceText={cardsFrom} subjectKey={subject || null} defaultTitle={title || 'From my notes'} source="note" onClose={() => setCardsFrom(null)} />
      )}
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this note?" description="This cannot be undone."
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" loading={del.isPending} onClick={() => del.mutate(noteId!, {
            onSuccess: () => { toast.success('Note deleted'); navigate('/notes', { replace: true }); },
            onError: (e) => toast.error(errorMessage(e)),
          })}>Delete</Button>
        </>} />
    </Page>
  );
}
