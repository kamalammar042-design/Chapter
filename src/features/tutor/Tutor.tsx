import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, ArrowUp, Camera, History, ImagePlus, Lightbulb, ListChecks, MessageSquarePlus, RefreshCw,
  Sparkles, Square, Trash2, X, CalendarRange, BookOpen, MoreHorizontal, Pencil, Target, NotebookPen, Layers, Feather,
} from 'lucide-react';
import { useAiAllowance } from '@/data/progress';
import { attachmentUrls, useConversations, useDeleteConversation, useMessages, useRenameConversation } from '@/data/social';
import { useStudentSubjects } from '@/data/profile';
import { qk } from '@/data/client';
import { useUser } from '@/features/auth/AuthProvider';
import { useTitle } from '@/components/layout/Page';
import { Button, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Menu } from '@/components/ui/Menu';
import { Alert, EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { Input } from '@/components/ui/Field';
import { SubjectIcon } from '@/components/SubjectIcon';
import { getSubject, getTopic, subjectLabel } from '@/content/catalog';
import { invokeFunction, prepareImage, streamTutor } from '@/lib/functions';
import { useCreateNote, addCardsToDeck } from '@/data/study';
import { Badge } from '@/components/ui/Badge';
import { errorMessage, toAppError } from '@/lib/errors';
import { relativeTime } from '@/lib/dates';
import type { TutorMessage } from '@/lib/types';

const Markdown = lazy(() => import('@/components/Markdown'));

type Mode = 'chat' | 'explain' | 'hint' | 'check' | 'simplify' | 'plan' | 'scan' | 'practice';

const MODES: Array<{ id: Mode; label: string; icon: typeof Sparkles; placeholder: string }> = [
  { id: 'chat', label: 'Ask', icon: Sparkles, placeholder: 'Ask anything…' },
  { id: 'explain', label: 'Explain', icon: BookOpen, placeholder: 'Which concept? e.g. osmosis' },
  { id: 'hint', label: 'Hint', icon: Lightbulb, placeholder: 'Paste the question you’re stuck on' },
  { id: 'check', label: 'Check my work', icon: ListChecks, placeholder: 'Paste the question and your working or answer' },
  { id: 'practice', label: 'Practice questions', icon: Target, placeholder: 'Which topic? (optional if a subject is chosen)' },
  { id: 'plan', label: 'Study plan', icon: CalendarRange, placeholder: 'Anything to include? (optional)' },
];

interface Pending { role: 'user' | 'assistant'; content: string; images?: string[]; error?: string }

export default function Tutor() {
  useTitle('AI Tutor');
  const { conversationId } = useParams();
  const [sp] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const conversations = useConversations();
  const messages = useMessages(conversationId);
  const allowance = useAiAllowance('tutor_message');
  const subjects = useStudentSubjects();

  const initialMode = (sp.get('mode') === 'scan' ? 'chat' : (MODES.find((m) => m.id === sp.get('mode'))?.id ?? 'chat')) as Mode;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [subjectKey, setSubjectKey] = useState<string | null>(sp.get('subject'));
  const [topicKey] = useState<string | null>(sp.get('topic'));
  const [text, setText] = useState('');
  const [images, setImages] = useState<Array<{ base64: string; previewUrl: string }>>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lastRequest, setLastRequest] = useState<Record<string, unknown> | null>(null);
  const [hintLevel, setHintLevel] = useState(1);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const autoSent = useRef(false);

  const activeConversation = conversations.data?.find((c) => c.id === conversationId);
  const showThread = !!conversationId || pending.length > 0;

  // Reset local state when switching conversations, except right after a
  // reply created this conversation: keep showing it until history loads.
  const handoff = useRef<string | null>(null);
  useEffect(() => {
    if (handoff.current && handoff.current === conversationId) return;
    setPending([]);
    abortRef.current?.abort();
    setStreaming(false);
  }, [conversationId]);
  useEffect(() => {
    if (handoff.current && handoff.current === conversationId && messages.data && !messages.isFetching) {
      handoff.current = null;
      setPending([]);
    }
  }, [conversationId, messages.data, messages.isFetching]);

  // keep the newest message in view
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: streaming ? 'auto' : 'smooth' });
  }, [pending, messages.data, streaming]);

  const send = useCallback(async (body: Record<string, unknown>, display: Pending) => {
    const ac = new AbortController();
    abortRef.current = ac;
    setStreaming(true);
    setLastRequest(body);
    setPending((p) => [...p.filter((m) => !m.error), display, { role: 'assistant', content: '' }]);
    let newId: string | null = null;
    try {
      await streamTutor(body, {
        onMeta: (m) => { newId = m.conversation_id; },
        onDelta: (t) => setPending((p) => {
          const copy = [...p];
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { ...last, content: last.content + t };
          return copy;
        }),
      }, ac.signal);
      qc.invalidateQueries({ queryKey: qk.conversations(user.id) });
      qc.invalidateQueries({ queryKey: qk.allowance(user.id, 'tutor_message') });
      if (newId && newId !== conversationId) {
        handoff.current = newId;
        navigate(`/tutor/${newId}`, { replace: !conversationId });
      } else if (newId) {
        await qc.refetchQueries({ queryKey: qk.messages(newId) });
        setPending([]);
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        setPending((p) => p.map((m, i) => (i === p.length - 1 && m.role === 'assistant' ? { ...m, content: m.content || '_Stopped._' } : m)));
        if (newId) qc.invalidateQueries({ queryKey: qk.conversations(user.id) });
      } else {
        const err = toAppError(e);
        setPending((p) => {
          const copy = [...p];
          if (copy[copy.length - 1]?.role === 'assistant' && !copy[copy.length - 1].content) copy.pop();
          return [...copy, { role: 'assistant', content: '', error: err.code === 'upgrade_required' || err.code === 'monthly_cap_reached' ? 'cap' : err.message }];
        });
        qc.invalidateQueries({ queryKey: qk.allowance(user.id, 'tutor_message') });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [conversationId, navigate, qc, user.id]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const msg = text.trim();
    if ((!msg && !images.length && mode !== 'plan' && !(mode === 'practice' && subjectKey)) || streaming) return;
    const m: Mode = images.length ? 'scan' : mode;
    if (m === 'hint') setHintLevel(1);
    const body = {
      conversation_id: conversationId ?? null,
      message: msg || (m === 'plan' ? 'Make me a study plan.' : m === 'scan' ? 'Help me with this question.' : m === 'practice' ? 'Give me some practice questions.' : ''),
      hint_level: m === 'hint' ? 1 : undefined,
      mode: m,
      subject_key: subjectKey,
      topic_key: subjectKey && topicKey ? topicKey : null,
      images: images.map((i) => ({ data: i.base64 })),
    };
    void send(body, { role: 'user', content: body.message, images: images.map((i) => i.previewUrl) });
    setText('');
    setImages([]);
    if (mode !== 'chat') setMode('chat');
  };

  // Deep links: highlight-and-explain from notes etc.
  useEffect(() => {
    const st = location.state as { prompt?: string; mode?: Mode; autoSend?: boolean } | null;
    if (st?.prompt && !autoSent.current) {
      autoSent.current = true;
      if (st.autoSend) {
        void send({ conversation_id: null, message: st.prompt, mode: st.mode ?? 'explain', subject_key: subjectKey, topic_key: null, images: [] },
          { role: 'user', content: st.prompt });
      } else {
        setText(st.prompt);
        if (st.mode) setMode(st.mode);
      }
      navigate(location.pathname + location.search, { replace: true, state: null });
    }
  }, [location, navigate, send, subjectKey]);

  const addImage = async (file: File | undefined) => {
    if (!file) return;
    if (images.length >= 3) return toast.error('You can attach up to 3 images.');
    try {
      const img = await prepareImage(file);
      setImages((xs) => [...xs, img]);
      textRef.current?.focus();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  /** Follow-ups offered under the latest reply: next hint level, or a simpler explanation. */
  const followUp = (kind: 'hint' | 'simplify') => {
    if (streaming || !conversationId) return;
    const level = Math.min(3, hintLevel + 1);
    if (kind === 'hint') setHintLevel(level);
    const body = {
      conversation_id: conversationId,
      message: kind === 'hint' ? 'I am still stuck. Can I have another hint?' : 'Can you explain that more simply?',
      mode: kind,
      hint_level: kind === 'hint' ? level : undefined,
      subject_key: subjectKey,
      topic_key: subjectKey && topicKey ? topicKey : null,
      images: [],
    };
    void send(body, { role: 'user', content: body.message });
  };

  const inHandoff = !!conversationId && handoff.current === conversationId && pending.length > 0;
  const serverMessages = conversationId && !inHandoff ? messages.data ?? [] : [];
  const a = allowance.data;
  const outOfMessages = a ? !a.allowed && a.reason !== 'slow_down' : false;
  const currentMode = MODES.find((m) => m.id === mode) ?? MODES[0];
  const subject = getSubject(subjectKey);

  return (
    <div className="tutor">
      <aside className="tutor__history" aria-label="Conversations">
        <HistoryList onPick={() => setHistoryOpen(false)} activeId={conversationId} conversations={conversations} />
      </aside>

      <section className="tutor__main" aria-label="Chat">
        <header className="tutor__head">
          <div className="row" style={{ minWidth: 0 }}>
            <IconButton className="tutor__history-btn" label="Conversation history" icon={<History />} onClick={() => setHistoryOpen(true)} />
            <div style={{ minWidth: 0 }}>
              <h1 className="fw-600 truncate text-md">{activeConversation?.title ?? 'AI Tutor'}</h1>
              {a && <p className="text-xs text-3">{a.cap > 0 ? `${a.remaining} of ${a.cap} messages left this month` : ''}</p>}
            </div>
          </div>
          <div className="row-sm">
            {conversationId && <ConversationMenu id={conversationId} title={activeConversation?.title ?? ''} />}
            <Button variant="secondary" size="sm" icon={<MessageSquarePlus />} onClick={() => navigate('/tutor')} disabled={streaming}>New</Button>
          </div>
        </header>

        <div className="tutor__scroll" ref={scrollRef}>
          {!showThread ? (
            <Welcome scanFirst={sp.get('mode') === 'scan'} onPick={(m, prompt) => { setMode(m); if (prompt) setText(prompt); textRef.current?.focus(); }}
              onScan={() => cameraRef.current?.click()} onUpload={() => fileRef.current?.click()} />
          ) : (
            <div className="tutor__thread">
              {conversationId && messages.isLoading && <div className="stack"><Skeleton height={60} /><Skeleton height={120} /></div>}
              {conversationId && messages.error && <ErrorState compact error={messages.error} onRetry={() => messages.refetch()} />}
              {serverMessages.map((m, i) => (
                <MessageBubble key={m.id} message={m}
                  actions={m.role === 'assistant' && !streaming && !pending.length ? (
                    <MessageActions content={m.content} title={activeConversation?.title ?? 'Tutor explanation'} subjectKey={subjectKey ?? activeConversation?.subject_key ?? null} topicKey={topicKey}
                      followUps={i === serverMessages.length - 1 ? { hint: m.mode === 'hint' && hintLevel < 3, onHint: () => followUp('hint'), onSimplify: () => followUp('simplify') } : null} />
                  ) : null} />
              ))}
              {pending.map((m, i) => (
                m.error ? (
                  <div key={`p${i}`} className="bubble bubble--assistant">
                    {m.error === 'cap' ? (
                      <Alert tone="info" icon={<Sparkles />}>
                        <p className="fw-600">You've used this month's tutor messages</p>
                        <p className="mt-1">Your allowance resets on the 1st.</p>
                        <Link to="/settings/usage" className="btn btn--secondary btn--sm mt-3">Your allowance</Link>
                      </Alert>
                    ) : (
                      <Alert tone="danger" icon={<AlertCircle />}>
                        <p>{m.error}</p>
                        {lastRequest && <Button size="sm" variant="secondary" icon={<RefreshCw />} className="mt-2" onClick={() => {
                          setPending((p) => p.slice(0, -2));
                          void send(lastRequest, { role: 'user', content: String(lastRequest.message ?? '') });
                        }}>Try again</Button>}
                      </Alert>
                    )}
                  </div>
                ) : (
                  <MessageBubble key={`p${i}`} message={{ id: `p${i}`, role: m.role, content: m.content, attachments: [], mode: null, created_at: '' }}
                    localImages={m.images} streaming={streaming && i === pending.length - 1 && m.role === 'assistant'} />
                )
              ))}
            </div>
          )}
        </div>

        <form className="tutor__composer" onSubmit={submit}>
          <div className="chip-row" role="group" aria-label="What do you need?">
            {MODES.map((m) => (
              <button key={m.id} type="button" className="chip" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
                <m.icon aria-hidden="true" /> {m.label}
              </button>
            ))}
            <SubjectPicker value={subjectKey} onChange={setSubjectKey} options={(subjects.data ?? []).map((s) => s.subject_key)} />
          </div>

          {images.length > 0 && (
            <div className="tutor__attachments">
              {images.map((img, i) => (
                <div key={img.previewUrl} className="tutor__thumb">
                  <img src={img.previewUrl} alt={`Attachment ${i + 1}`} />
                  <button type="button" aria-label={`Remove attachment ${i + 1}`} onClick={() => setImages((xs) => xs.filter((_, j) => j !== i))}><X size={14} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="tutor__input">
            <IconButton label="Take a photo of a question" icon={<Camera />} onClick={() => cameraRef.current?.click()} disabled={streaming} />
            <IconButton label="Upload an image" icon={<ImagePlus />} onClick={() => fileRef.current?.click()} disabled={streaming} className="hide-mobile" />
            <label htmlFor="tutor-input" className="sr-only">Message the tutor</label>
            <textarea
              id="tutor-input"
              ref={textRef}
              className="tutor__textarea"
              rows={1}
              value={text}
              maxLength={8000}
              placeholder={images.length ? 'Add a note (optional)' : currentMode.placeholder}
              onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(200, e.target.scrollHeight)}px`; }}
              onKeyDown={onKeyDown}
              disabled={outOfMessages}
            />
            {streaming ? (
              <IconButton variant="secondary" label="Stop" icon={<Square />} onClick={() => abortRef.current?.abort()} />
            ) : (
              <IconButton variant="primary" type="submit" label="Send" icon={<ArrowUp />} disabled={outOfMessages || (!text.trim() && !images.length && mode !== 'plan' && !(mode === 'practice' && subjectKey))} />
            )}
          </div>
          <p className="tutor__hint text-xs text-3">
            {subject ? <>Focused on <strong>{subjectLabel(subject)}</strong>{topicKey && subjectKey ? ` · ${getTopic(subjectKey, topicKey)?.name ?? ''}` : ''} · </> : null}
            The tutor can make mistakes. Check important facts.
          </p>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/heic" hidden onChange={(e) => { void addImage(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void addImage(e.target.files?.[0]); e.target.value = ''; }} />
        </form>
      </section>

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} title="Conversations">
        <HistoryList onPick={() => setHistoryOpen(false)} activeId={conversationId} conversations={conversations} />
      </Dialog>
    </div>
  );
}

function Welcome({ onPick, onScan, onUpload, scanFirst }: { onPick: (m: Mode, prompt?: string) => void; onScan: () => void; onUpload: () => void; scanFirst: boolean }) {
  const ideas: Array<{ mode: Mode; title: string; body: string; icon: typeof Sparkles; prompt?: string }> = [
    { mode: 'explain', title: 'Explain a concept', body: 'Step by step, at your level', icon: BookOpen },
    { mode: 'hint', title: "I'm stuck on a question", body: 'Get a hint, not the answer', icon: Lightbulb },
    { mode: 'check', title: 'Check my work', body: 'Correct, partly correct or not, and where it went wrong', icon: ListChecks },
    { mode: 'practice', title: 'Give me practice questions', body: 'Aimed at the skills you find hardest', icon: Target },
    { mode: 'plan', title: 'Make me a study plan', body: 'Built around your exams and weak topics', icon: CalendarRange, prompt: '' },
  ];
  if (scanFirst) {
    // Browsers only open the camera from a direct tap, so ask for one.
    return (
      <div className="tutor__welcome fade-up">
        <span className="state__icon" aria-hidden="true"><Camera /></span>
        <h2 className="text-xl fw-600">Scan a question</h2>
        <p className="text-2" style={{ maxWidth: '46ch' }}>Take a clear photo of one question, flat and well lit. I'll read it and help you work through it step by step.</p>
        <div className="row row--wrap" style={{ justifyContent: 'center' }}>
          <Button icon={<Camera />} onClick={onScan}>Take a photo</Button>
          <Button variant="secondary" icon={<ImagePlus />} onClick={onUpload}>Upload an image</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="tutor__welcome fade-up">
      <span className="state__icon" aria-hidden="true"><Sparkles /></span>
      <h2 className="text-xl fw-600">How can I help you study?</h2>
      <p className="text-2" style={{ maxWidth: '46ch' }}>I know your subjects, exam dates and the topics you find hard, so explanations fit where you are.</p>
      <div className="tutor__ideas">
        {ideas.map((i) => (
          <button key={i.title} type="button" className="card card--interactive card--tight row" onClick={() => onPick(i.mode, i.prompt)}>
            <i.icon size={18} className="text-primary shrink-0" aria-hidden="true" />
            <span className="grow"><span className="fw-600 text-sm" style={{ display: 'block' }}>{i.title}</span><span className="text-xs text-3">{i.body}</span></span>
          </button>
        ))}
        <button type="button" className="card card--interactive card--tight row" onClick={onScan}>
          <Camera size={18} className="text-primary shrink-0" aria-hidden="true" />
          <span className="grow"><span className="fw-600 text-sm" style={{ display: 'block' }}>Scan a past-paper question</span><span className="text-xs text-3">Take a photo and work through it together</span></span>
        </button>
      </div>
    </div>
  );
}

const VERDICT = /^\s*\*\*Verdict:\s*(Correct|Partially correct|Incorrect|Unclear)\*\*\s*\n?/i;
const VERDICT_STYLE: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  'correct': { label: 'Correct', tone: 'success' },
  'partially correct': { label: 'Partially correct', tone: 'warning' },
  'incorrect': { label: 'Incorrect', tone: 'danger' },
  'unclear': { label: 'Unclear', tone: 'neutral' },
};

/** Check-my-work replies start with a verdict line; show it as a badge. */
function splitVerdict(content: string): { verdict: { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } | null; body: string } {
  const m = VERDICT.exec(content);
  if (!m) return { verdict: null, body: content };
  return { verdict: VERDICT_STYLE[m[1].toLowerCase()] ?? null, body: content.slice(m[0].length) };
}

function MessageBubble({ message, localImages, streaming, actions }: { message: TutorMessage; localImages?: string[]; streaming?: boolean; actions?: ReactNode }) {
  const [urls, setUrls] = useState<string[]>(localImages ?? []);
  useEffect(() => {
    if (!localImages && message.attachments?.length) attachmentUrls(message.attachments).then(setUrls).catch(() => setUrls([]));
  }, [message.attachments, localImages]);
  const isUser = message.role === 'user';
  const { verdict, body } = isUser ? { verdict: null, body: message.content } : splitVerdict(message.content);
  return (
    <div className={`bubble bubble--${message.role}`}>
      {!isUser && <span className="bubble__avatar" aria-hidden="true"><Sparkles size={14} /></span>}
      <div className="bubble__body">
        <span className="sr-only">{isUser ? 'You said:' : 'Tutor:'}</span>
        {urls.length > 0 && (
          <div className="bubble__images">
            {urls.map((u, i) => <img key={u} src={u} alt={`Upload ${i + 1}`} loading="lazy" />)}
          </div>
        )}
        {verdict && <p className="mb-2"><Badge tone={verdict.tone}>Verdict: {verdict.label}</Badge></p>}
        {isUser ? (
          <p style={{ whiteSpace: 'pre-wrap' }}>{message.content.replace(/\*\*(Question|My answer|Correct answer|Likely misconception):\*\*/g, '$1:')}</p>
        ) : body ? (
          <Suspense fallback={<p style={{ whiteSpace: 'pre-wrap' }}>{body}</p>}>
            <Markdown>{body}</Markdown>
          </Suspense>
        ) : streaming ? (
          <p className="text-3 row-sm typing" aria-label="The tutor is thinking"><span /><span /><span /></p>
        ) : null}
        {actions}
      </div>
    </div>
  );
}

/** Save a reply as a note or flashcards, and follow-ups for the latest reply. */
function MessageActions({ content, title, subjectKey, topicKey, followUps }: {
  content: string; title: string; subjectKey: string | null; topicKey: string | null;
  followUps: { hint: boolean; onHint: () => void; onSimplify: () => void } | null;
}) {
  const toast = useToast();
  const createNote = useCreateNote();
  const [cards, setCards] = useState<'idle' | 'busy' | 'done'>('idle');
  const [noted, setNoted] = useState(false);
  const saveNote = () => createNote.mutate(
    { title: title.slice(0, 120), body: splitVerdict(content).body, subject_key: subjectKey, topic_key: subjectKey ? topicKey : null },
    { onSuccess: () => { setNoted(true); toast.success('Saved to your notes.'); }, onError: (e) => toast.error(errorMessage(e)) },
  );
  const makeCards = async () => {
    if (!subjectKey) return toast.error('Choose a subject first, so the cards go in the right deck.');
    setCards('busy');
    try {
      const res = await invokeFunction<{ cards: Array<{ front: string; back: string }> }>('ai-generate', {
        kind: 'flashcards', subject_key: subjectKey, topic_key: topicKey, source_text: content.slice(0, 20000), count: 6,
      }, { timeoutMs: 90_000 });
      const s = getSubject(subjectKey);
      const r = await addCardsToDeck({
        title: `Tutor: ${s ? subjectLabel(s) : subjectKey}`, subject_key: subjectKey, source: 'tutor',
        cards: res.cards.map((c) => ({ ...c, topic_key: topicKey, source_kind: 'tutor' as const })),
      });
      setCards('done');
      toast.success(r.added ? `Added ${r.added} card${r.added === 1 ? '' : 's'}${r.skipped ? ` (${r.skipped} already in the deck)` : ''}.` : 'Those cards are already in your deck.');
    } catch (e) {
      setCards('idle');
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="bubble__actions" role="group" aria-label="Reply actions">
      {followUps?.hint && <Button size="sm" variant="secondary" icon={<Lightbulb />} onClick={followUps.onHint}>Next hint</Button>}
      {followUps && <Button size="sm" variant="ghost" icon={<Feather />} onClick={followUps.onSimplify}>Explain more simply</Button>}
      <Button size="sm" variant="ghost" icon={<NotebookPen />} onClick={saveNote} loading={createNote.isPending} disabled={noted}>{noted ? 'Saved' : 'Save as note'}</Button>
      <Button size="sm" variant="ghost" icon={<Layers />} onClick={makeCards} loading={cards === 'busy'} disabled={cards === 'done'}>{cards === 'done' ? 'Cards added' : 'Make flashcards'}</Button>
    </div>
  );
}

function HistoryList({ activeId, onPick, conversations }: { activeId?: string; onPick: () => void; conversations: ReturnType<typeof useConversations> }) {
  if (conversations.isLoading) return <div className="stack-sm" style={{ padding: 12 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={40} />)}</div>;
  if (conversations.error) return <ErrorState compact error={conversations.error} onRetry={() => conversations.refetch()} />;
  if (!conversations.data?.length) return <EmptyState compact title="No conversations yet" body="Your chats with the tutor will appear here." />;
  return (
    <nav className="stack-sm tutor__history-list" aria-label="Past conversations" style={{ gap: 2 }}>
      {conversations.data.map((c) => (
        <Link key={c.id} to={`/tutor/${c.id}`} onClick={onPick} className="nav-link" aria-current={c.id === activeId ? 'page' : undefined} style={{ height: 'auto', padding: '8px 12px' }}>
          {c.subject_key ? <SubjectIcon subjectKey={c.subject_key} size="sm" /> : <span className="subject-icon subject-icon--sm" aria-hidden="true"><Sparkles /></span>}
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="truncate" style={{ display: 'block' }}>{c.title}</span>
            <span className="text-xs text-3">{relativeTime(c.updated_at)}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}

function ConversationMenu({ id, title }: { id: string; title: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const del = useDeleteConversation();
  const rename = useRenameConversation();
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [value, setValue] = useState(title);
  return (
    <>
      <Menu label="Conversation actions" items={[
        { label: 'Rename', icon: <Pencil />, onSelect: () => { setValue(title); setRenaming(true); } },
        { label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => setConfirm(true) },
      ]} trigger={(p) => <IconButton label="Conversation actions" icon={<MoreHorizontal />} size="sm" {...p} />} />
      <Dialog open={renaming} onClose={() => setRenaming(false)} title="Rename conversation" footer={<>
        <Button variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
        <Button loading={rename.isPending} disabled={!value.trim()} onClick={() => rename.mutate({ id, title: value.trim() }, { onSuccess: () => setRenaming(false), onError: (e) => toast.error(errorMessage(e)) })}>Save</Button>
      </>}>
        <Input aria-label="Title" value={value} maxLength={120} onChange={(e) => setValue(e.target.value)} data-autofocus />
      </Dialog>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Delete this conversation?" description="The messages and any images you uploaded in it will be permanently deleted." footer={<>
        <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
        <Button variant="danger" loading={del.isPending} onClick={() => del.mutate(id, { onSuccess: () => { setConfirm(false); navigate('/tutor'); toast.success('Conversation deleted'); }, onError: (e) => toast.error(errorMessage(e)) })}>Delete</Button>
      </>} />
    </>
  );
}

function SubjectPicker({ value, onChange, options }: { value: string | null; onChange: (v: string | null) => void; options: string[] }) {
  const items = useMemo(() => options.map((k) => getSubject(k)).filter((s) => !!s), [options]);
  return (
    <label className="chip" style={{ paddingRight: 4 }}>
      <span className="sr-only">Subject</span>
      <select className="chip-select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Any subject</option>
        {items.map((s) => <option key={s!.key} value={s!.key}>{subjectLabel(s!)}</option>)}
      </select>
    </label>
  );
}
