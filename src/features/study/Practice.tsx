import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, BookOpen, CheckCircle2, CloudOff, Flag, Layers, Lightbulb, Lock, RotateCcw, Sparkles, Target, TrendingDown,
  TrendingUp, X, XCircle, Home as HomeIcon, Zap, Clock,
} from 'lucide-react';
import { getSubject, getTopic, subjectLabel } from '@/content/catalog';
import { buildPracticeSet, difficultyLabel, xpBand, type Question } from '@/content/engine';
import { advanceGuided, guidedAdvice, guidedBand, startGuided, type GuidedState } from '@/content/adaptive';
import { skillById } from '@/content/skills';
import { misconceptionText } from '@/content/misconceptions';
import { useProfile, useStudentSubjects } from '@/data/profile';
import { masteryMap, useSkillMastery } from '@/data/learning';
import { endSession, recordAttempt, recordSkip, reportQuestion, startSession, type ReportReason } from '@/data/attempts';
import { addCardsToDeck } from '@/data/study';
import { qk } from '@/data/client';
import { useUser } from '@/features/auth/AuthProvider';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { ProgressBar, ProgressRing } from '@/components/ui/Progress';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useTitle } from '@/components/layout/Page';
import { SubjectIcon } from '@/components/SubjectIcon';
import { xpFor } from '@/lib/league';
import { errorMessage, toAppError } from '@/lib/errors';
import { formatMinutes } from '@/lib/dates';
import type { PoolRow, PracticeMode, SkillMasteryRow, SubmitResult } from '@/lib/types';
import { InlineExplain, type ExplainContext } from '@/features/tutor/InlineExplain';
import { usePracticeSet, type EmptyReason, type PracticeParams } from './usePracticeSet';
import type { GeneratedSet } from './practiceTypes';

const MODES: PracticeMode[] = ['practice', 'daily', 'weakness', 'review', 'exam', 'guided'];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const LEGACY_BANDS: Record<string, [number, number]> = { easy: [1, 2], medium: [3, 3], hard: [4, 5] };

interface Answer {
  question: Question;
  chosen: number;
  correct: boolean;
  timeMs: number;
  hints: number;
  result: SubmitResult | null;
  misconception: string | null;
}

function parsePracticeParams(sp: URLSearchParams, generated: GeneratedSet | null): PracticeParams {
  const mode = (MODES.includes(sp.get('mode') as PracticeMode) ? sp.get('mode') : 'practice') as PracticeMode;
  const level = Number(sp.get('level'));
  const band: [number, number] | null = Number.isInteger(level) && level >= 1 && level <= 5
    ? [level, level]
    : LEGACY_BANDS[sp.get('difficulty') ?? ''] ?? null;
  const skill = sp.get('skill');
  return {
    mode,
    subjectKey: sp.get('subject') ?? (skill ? skill.split('/')[0] : null),
    topicKey: sp.get('topic'),
    skillId: skill && /^[a-z0-9_.-]+\/[a-z0-9-]+\/[a-z0-9-]+$/.test(skill) ? skill : null,
    count: Math.min(30, Math.max(3, Number(sp.get('count')) || 10)),
    band,
    generated,
  };
}

const EMPTY_COPY: Record<EmptyReason, { title: string; body: string }> = {
  no_reviews: { title: 'Nothing is due for review', body: 'Skills come back for review a day, then a few days, then weeks after you practise them. Check back tomorrow, or practise something new.' },
  no_subjects: { title: 'Choose your subjects first', body: 'Add at least one subject to start practising.' },
  no_weak_skills: { title: 'No weak skills yet', body: 'Answer a few questions in each topic and Chapter will find the skills that need work.' },
  no_questions: { title: 'No questions available here yet', body: 'There are no published questions for this selection at your level yet. Try another topic, generate some from the subject page, or ask the tutor to quiz you.' },
};

export default function Practice() {
  const [sp] = useSearchParams();
  const location = useLocation();
  const user = useUser();
  const profile = useProfile();
  const subjects = useStudentSubjects();
  const mastery = useSkillMastery();

  const generated = (location.state as { generated?: GeneratedSet } | null)?.generated ?? null;
  const params = useMemo(() => parsePracticeParams(sp, generated), [sp, generated]);

  const [set, rebuild] = usePracticeSet(params, { userId: user.id, profile: profile.data, subjects: subjects.data, mastery: mastery.data });
  const subject = getSubject(params.subjectKey);
  const topic = params.subjectKey && params.topicKey ? getTopic(params.subjectKey, params.topicKey) : undefined;
  const skill = skillById(params.skillId);
  const title = params.mode === 'review' ? 'Spaced review'
    : params.mode === 'weakness' ? 'Weak skills'
      : skill?.name ?? topic?.name ?? (subject ? subjectLabel(subject) : 'Smart mix');
  useTitle(title);

  const loadError = profile.error ?? subjects.error ?? mastery.error;
  if (loadError) return <div className="page"><h1 className="sr-only">{title}</h1><ErrorState error={loadError} onRetry={() => { void profile.refetch(); void subjects.refetch(); void mastery.refetch(); }} /></div>;
  if (set.status === 'loading') return <div className="page"><PageLoader label="Preparing your questions" /></div>;
  if (set.status === 'error') return <div className="page"><h1 className="sr-only">{title}</h1><ErrorState error={set.error} onRetry={rebuild} /></div>;
  if (set.status === 'empty') {
    const copy = EMPTY_COPY[set.reason];
    return (
      <div className="page page--narrow">
        <h1 className="sr-only">{title}</h1>
        <EmptyState
          icon={set.reason === 'no_reviews' ? <CheckCircle2 /> : <Sparkles />}
          title={copy.title}
          body={copy.body}
          actions={set.reason === 'no_subjects'
            ? <ButtonLink to="/settings/study">Add subjects</ButtonLink>
            : <><ButtonLink to={subject ? `/study/${subject.key}` : '/study'} variant="secondary">Back</ButtonLink><ButtonLink to={`/tutor${subject ? `?subject=${subject.key}${topic ? `&topic=${params.topicKey}` : ''}` : ''}`} icon={<Sparkles />}>Ask the tutor</ButtonLink></>}
        />
      </div>
    );
  }
  return (
    <Session
      key={`${params.mode}|${set.questions.map((q) => q.ref).join('|')}|${set.pool.length}`}
      initial={set.questions} pool={set.pool} offline={set.offline} params={params} title={title}
      mastery={mastery.data ?? []} onAgain={rebuild} />
  );
}

function Session({ initial, pool, offline, params, title, mastery, onAgain }: {
  initial: Question[]; pool: PoolRow[]; offline: boolean; params: PracticeParams; title: string; mastery: SkillMasteryRow[]; onAgain: () => void;
}) {
  const user = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const guidedMode = params.mode === 'guided';
  const allowHints = params.mode !== 'exam';
  const masteryById = useMemo(() => masteryMap(mastery), [mastery]);

  const [guided, setGuided] = useState<GuidedState | null>(() =>
    guidedMode ? startGuided(params.skillId ? masteryById.get(params.skillId)?.mastery : undefined) : null);
  const [questions, setQuestions] = useState<Question[]>(() => {
    if (!guidedMode) return initial;
    const g = startGuided(params.skillId ? masteryById.get(params.skillId)?.mastery : undefined);
    return buildPracticeSet(pool, { count: 1, band: guidedBand(g), mastery: masteryById });
  });
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [hints, setHints] = useState(0);
  const [queued, setQueued] = useState(offline);
  const [blocked, setBlocked] = useState<'free_limit_reached' | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [concept, setConcept] = useState<Question | null>(null);
  const [finished, setFinished] = useState(false);
  const shownAt = useRef(Date.now());
  const sessionId = useRef<Promise<string> | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  const q = questions[index];
  const answered = chosen !== null;
  const current = answers.length > index ? answers[index] : null;
  const total = guidedMode ? Math.max(questions.length, 12) : questions.length;

  useEffect(() => { shownAt.current = Date.now(); setHints(0); }, [index]);

  const refreshData = useCallback(() => {
    for (const key of [qk.topicStats(user.id), qk.activity(user.id), qk.profile(user.id), qk.sessions(user.id), qk.quota(user.id),
      qk.recentAttempts(user.id), qk.leaderboard(user.id), qk.skillMastery(user.id),
      qk.misconceptions(user.id), qk.dueReviews(user.id)]) {
      qc.invalidateQueries({ queryKey: key });
    }
  }, [qc, user.id]);

  const choose = useCallback(async (i: number) => {
    if (answered || blocked || !q) return;
    const correct = i === q.correct;
    const timeMs = Date.now() - shownAt.current;
    const localMisc = !correct && q.kind === 'procedural' ? misconceptionText(q.skillId, q.misconceptions[i]) : null;
    setChosen(i);
    // light haptic feedback on phones (ignored where unsupported)
    try { navigator.vibrate?.(correct ? 12 : [14, 50, 14]); } catch { /* not available */ }
    const at = answers.length;
    setAnswers((a) => [...a, { question: q, chosen: i, correct, timeMs, hints, result: null, misconception: localMisc }]);
    requestAnimationFrame(() => feedbackRef.current?.focus());

    try {
      if (!sessionId.current) {
        sessionId.current = startSession(user.id, { mode: params.mode, subjectKey: params.subjectKey, topicKey: params.topicKey });
      }
      const sid = await sessionId.current;
      const res = await recordAttempt(user.id, {
        sessionId: sid,
        questionId: q.questionId,
        selected: q.kind === 'mcq' ? q.order[i] : null,
        instance: q.kind === 'procedural'
          ? { correct, misconception: correct ? null : q.misconceptions[i] ?? null, ref: q.ref, text: q.q }
          : null,
        timeMs,
        hints,
        mode: params.mode,
      });
      if (res.status === 'queued') {
        setQueued(true);
      } else {
        // The server's verdict is the one that counts.
        const r = res.result;
        setAnswers((a) => a.map((x, k) => (k === at ? { ...x, correct: r.correct, result: r, misconception: r.misconception ?? x.misconception } : x)));
      }
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'free_limit_reached') {
        setBlocked('free_limit_reached');
        setAnswers((a) => a.slice(0, at)); // not recorded, so not counted
      } else {
        toast.error(err.message);
      }
    }
  }, [answered, blocked, q, answers.length, hints, user.id, params, toast]);

  const finish = useCallback(() => {
    setFinished(true);
    if (sessionId.current) void sessionId.current.then((id) => endSession(user.id, id));
    refreshData();
  }, [refreshData, user.id]);

  const next = useCallback(() => {
    if (!answered || !current) return;
    setExplainOpen(false);
    if (guidedMode && guided) {
      const g = advanceGuided(guided, { difficulty: current.question.difficulty, correct: current.correct, hinted: current.hints > 0 });
      setGuided(g);
      if (g.phase === 'done') return finish();
      const exclude = new Set(questions.map((x) => x.ref));
      const texts = new Set(questions.map((x) => x.q));
      const [nq] = buildPracticeSet(pool.filter((r) => r.question_type === 'procedural' || !exclude.has(r.id)), {
        count: 1, band: guidedBand(g), mastery: masteryById, exclude,
      }).filter((x) => !texts.has(x.q));
      if (!nq) return finish();
      if (g.explainNext) setConcept(current.question);
      setQuestions((qs) => [...qs, nq]);
      setIndex((n) => n + 1);
      setChosen(null);
      return;
    }
    if (index + 1 >= questions.length) finish();
    else {
      setIndex((n) => n + 1);
      setChosen(null);
    }
  }, [answered, current, guidedMode, guided, finish, questions, pool, masteryById, index]);

  // keyboard: A–D or 1–4 to answer, Enter/→ for next
  useEffect(() => {
    if (finished || !q) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || explainOpen || confirmExit || reportOpen || concept) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toUpperCase();
      const byLetter = LETTERS.indexOf(k);
      const byNum = Number(k) - 1;
      const i = byLetter >= 0 ? byLetter : byNum >= 0 && byNum < 9 ? byNum : -1;
      if (!answered && i >= 0 && i < q.options.length) { e.preventDefault(); void choose(i); }
      else if (answered && (e.key === 'Enter' || e.key === 'ArrowRight')) { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answered, choose, next, q, finished, explainOpen, confirmExit, reportOpen, concept]);

  const correctShown = current?.result?.correct_index != null && q?.kind === 'mcq'
    ? q.order.indexOf(current.result.correct_index)
    : q?.correct ?? 0;

  const explainCtx = useMemo<ExplainContext | null>(() => (answered && chosen !== null && q ? {
    question: q.q, options: q.options, chosen: q.options[chosen], correct: q.options[correctShown],
    explanation: q.exp, subjectKey: q.subjectKey, topicKey: q.topicKey,
  } : null), [answered, chosen, q, correctShown]);

  const leave = () => {
    if (q && !answered && Date.now() - shownAt.current > 3000) void recordSkip(q.questionId);
    refreshData();
    navigate(-1);
  };
  const exit = () => (answers.length && !finished ? setConfirmExit(true) : leave());

  if (finished || !q) {
    return <Summary answers={answers} title={title} params={params} queued={queued} guided={guided} mastery={masteryById} onAgain={onAgain} />;
  }

  const isCorrect = answered && (current?.correct ?? chosen === q.correct);
  const s = getSubject(q.subjectKey);
  const t = getTopic(q.subjectKey, q.topicKey);
  const skill = skillById(q.skillId);
  const [passage, prompt] = splitStem(q.q);
  const hintText = q.hint ?? (skill ? `Focus on this: ${skill.objective}` : null);
  const xp = current?.result ? current.result.xp : Math.floor(xpFor(xpBand(q.difficulty), true) / (hints > 0 ? 2 : 1));

  return (
    <div className="practice">
      <div className="practice__bar">
        <button type="button" className="btn btn--ghost btn--icon" onClick={exit} aria-label="Exit practice"><X aria-hidden="true" /></button>
        <div className="grow">
          <ProgressBar value={index + (answered ? 1 : 0)} max={total} label="Session progress" />
        </div>
        <span className="text-sm text-3 num" aria-live="polite">{index + 1} / {guidedMode ? `up to ${total}` : total}</span>
      </div>

      <div className="practice__body">
        <div className="row-sm row--wrap mb-4">
          <SubjectIcon subjectKey={q.subjectKey} size="sm" />
          <span className="text-sm text-2">{s ? subjectLabel(s) : ''} · {t?.name}{skill ? ` · ${skill.name}` : ''}</span>
          <Badge outline>{difficultyLabel(q.difficulty)}</Badge>
          {q.kind === 'procedural' && <Badge>Generated</Badge>}
          {q.source === 'generated' && <Badge tone="primary">AI-written, checked</Badge>}
          {guided && <Badge tone="info" icon={<Target />}>{guided.phase === 'diagnose' ? 'Finding your level' : guided.phase === 'stretch' ? 'Stretch' : 'Guided'}</Badge>}
          {queued && <Badge icon={<CloudOff />}>Saved offline</Badge>}
        </div>

        {passage && <div className="passage practice__passage">{passage.split('\n\n').map((para, k) => <p key={k}>{para}</p>)}</div>}
        <h1 className="practice__question">{prompt}</h1>

        {allowHints && !answered && hintText && (
          hints > 0
            ? <p className="hint-box mt-3" role="note"><Lightbulb aria-hidden="true" size={16} /> {hintText}</p>
            : <Button variant="ghost" size="sm" icon={<Lightbulb />} className="mt-3" onClick={() => setHints(1)}>Show a hint</Button>
        )}

        <div className="practice__options" role="group" aria-label="Answer options">
          {q.options.map((o, i) => {
            const state = !answered ? '' : i === correctShown ? 'is-correct' : i === chosen ? 'is-wrong' : 'is-dim';
            return (
              <button key={i} type="button" className={`option ${state}`} onClick={() => choose(i)} disabled={answered || !!blocked}
                aria-describedby={answered && (i === correctShown || i === chosen) ? 'feedback' : undefined}>
                <span className="option__key" aria-hidden="true">{LETTERS[i]}</span>
                <span className="option__text">{o}</span>
                {answered && i === correctShown && <CheckCircle2 className="option__icon" aria-label="Correct answer" />}
                {answered && i === chosen && i !== correctShown && <XCircle className="option__icon" aria-label="Your answer" />}
              </button>
            );
          })}
        </div>

        {blocked && (
          <Card accent className="mt-6">
            <div className="row row--top">
              <Lock size={20} className="text-primary shrink-0" aria-hidden="true" />
              <div className="grow">
                <p className="fw-600">You've reached this month's question limit</p>
                <p className="text-sm text-2 mt-1">That answer wasn't recorded. Your XP, streak and progress are safe, and the limit resets on the 1st.</p>
                <div className="row row--wrap mt-4">
                  <ButtonLink to="/settings/usage">Your allowance</ButtonLink>
                  <ButtonLink to="/review" variant="secondary">Review flashcards instead</ButtonLink>
                </div>
              </div>
            </div>
          </Card>
        )}

        {answered && !blocked && (
          <div ref={feedbackRef} tabIndex={-1} id="feedback" className={`feedback ${isCorrect ? 'feedback--correct' : 'feedback--wrong'}`} role="status">
            <div className="row row--between row--wrap">
              <p className="feedback__title">
                {isCorrect ? <><CheckCircle2 aria-hidden="true" /> Correct</> : <><XCircle aria-hidden="true" /> Not quite. The answer is {LETTERS[correctShown]}.</>}
              </p>
              {isCorrect && <Badge tone="primary" icon={<Zap />}>+{xp} XP</Badge>}
            </div>
            {!isCorrect && current?.misconception && (
              <p className="feedback__misc"><strong>Common mistake:</strong> {current.misconception}</p>
            )}
            {q.exp && <p className="feedback__exp">{q.exp}</p>}
            {explainOpen && explainCtx && <InlineExplain ctx={explainCtx} />}
            <div className="feedback__actions">
              {!isCorrect && !explainOpen && (
                <Button variant="secondary" icon={<Sparkles />} onClick={() => setExplainOpen(true)}>Explain my mistake</Button>
              )}
              <Button iconRight={<ArrowRight />} onClick={next} className="feedback__next">
                {!guidedMode && index + 1 >= questions.length ? 'See results' : 'Next question'}
              </Button>
            </div>
            <div className="row row--between row--wrap">
              <p className="text-xs text-3 hide-mobile">Tip: press <span className="kbd">A</span>–<span className="kbd">D</span> to answer and <span className="kbd">Enter</span> to continue.</p>
              <button type="button" className="link-button text-xs" onClick={() => setReportOpen(true)}><Flag size={12} aria-hidden="true" /> Report a problem</button>
            </div>
          </div>
        )}
      </div>

      <ConceptCard question={concept} onClose={() => setConcept(null)} />
      <ReportDialog open={reportOpen} questionId={q.questionId} onClose={() => setReportOpen(false)} />
      <Dialog open={confirmExit} onClose={() => setConfirmExit(false)} title="Leave this session?"
        description={`Your ${answers.length} answer${answers.length === 1 ? ' is' : 's are'} already saved.`}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmExit(false)}>Keep going</Button>
          <Button onClick={leave}>Leave</Button>
        </>} />
    </div>
  );
}

/** Long stems carry a reading passage before the actual question. */
function splitStem(stem: string): [string | null, string] {
  const i = stem.lastIndexOf('\n\n');
  return i > 200 ? [stem.slice(0, i), stem.slice(i + 2)] : [null, stem];
}

/** Shown in guided mode after a wrong answer, before the next question. */
function ConceptCard({ question, onClose }: { question: Question | null; onClose: () => void }) {
  const skill = skillById(question?.skillId);
  if (!question) return null;
  return (
    <Dialog open onClose={onClose} title={skill ? `The idea: ${skill.name}` : 'The idea behind that question'}
      footer={<Button onClick={onClose}>Try another question</Button>}>
      <div className="stack-sm">
        {skill && <p className="text-base">{skill.objective}</p>}
        {question.exp && <p className="text-sm text-2" style={{ whiteSpace: 'pre-line' }}>{question.exp}</p>}
        <p className="text-sm text-3">Next comes a different question on the same skill, one level easier.</p>
      </div>
    </Dialog>
  );
}

const REASONS: Array<[ReportReason, string]> = [
  ['wrong_answer', 'The marked answer is wrong'],
  ['unclear', 'The question is unclear'],
  ['typo', 'There is a typo or formatting problem'],
  ['off_syllabus', 'It is not on my syllabus'],
  ['other', 'Something else'],
];

function ReportDialog({ open, questionId, onClose }: { open: boolean; questionId: string; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason>('wrong_answer');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await reportQuestion(questionId, reason, comment);
      toast.success('Thanks. A person will review this question.');
      setComment('');
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Report a problem" busy={busy}
      description="Reports go to the Chapter content team. Questions with open reports are reviewed before they are shown again."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Send report</Button></>}>
      <div className="stack">
        <Field label="What is wrong?">
          <Select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
            {REASONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        </Field>
        <Field label="Details" optional hint="Do not include personal information.">
          <Textarea rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

/** isNew: the student had no record for this skill before the session, so there is no "before" to compare with */
interface SkillChange { skillId: string; name: string; before: number; after: number; total: number; correct: number; isNew: boolean }

function Summary({ answers, title, params, queued, guided, mastery, onAgain }: {
  answers: Answer[]; title: string; params: PracticeParams; queued: boolean; guided: GuidedState | null;
  mastery: Map<string, SkillMasteryRow>; onAgain: () => void;
}) {
  const toast = useToast();
  const [explaining, setExplaining] = useState<number | null>(null);
  const [cardsState, setCardsState] = useState<'idle' | 'busy' | 'done'>('idle');
  const correct = answers.filter((a) => a.correct).length;
  const total = answers.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const xp = answers.reduce((s, a) => s + (a.result ? a.result.xp : Math.floor(xpFor(xpBand(a.question.difficulty), a.correct) / (a.hints ? 2 : 1))), 0);
  const seconds = answers.reduce((s, a) => s + Math.min(a.timeMs, 180_000), 0) / 1000;
  const wrong = answers.filter((a) => !a.correct);
  const hinted = answers.filter((a) => a.hints > 0).length;
  const misconceptions = [...new Set(answers.map((a) => (!a.correct ? a.misconception : null)).filter((m): m is string => !!m))];

  const skills = useMemo<SkillChange[]>(() => {
    const m = new Map<string, SkillChange>();
    for (const a of answers) {
      const id = a.question.skillId;
      if (!id) continue;
      const e = m.get(id) ?? {
        skillId: id, name: skillById(id)?.name ?? id.split('/')[2],
        before: a.result?.mastery_before ?? mastery.get(id)?.mastery ?? 0, after: 0, total: 0, correct: 0,
        isNew: !mastery.get(id)?.attempts && (a.result?.mastery_before ?? 0) === 0,
      };
      e.total++;
      if (a.correct) e.correct++;
      e.after = a.result?.mastery_after ?? e.after;
      m.set(id, e);
    }
    return [...m.values()].map((e) => ({ ...e, after: e.after || e.before })).sort((a, b) => a.correct / a.total - b.correct / b.total);
  }, [answers, mastery]);

  const weakest = skills.find((s) => s.correct / s.total < 0.7);
  const advice = guided ? guidedAdvice(guided) : null;
  const headline = advice?.title ?? (pct >= 90 ? 'Excellent work' : pct >= 70 ? 'Good session' : pct >= 50 ? 'Solid effort' : 'Keep at it');
  const back = params.subjectKey ? `/study/${params.subjectKey}` : '/home';

  const makeCards = async () => {
    setCardsState('busy');
    try {
      const bySubject = new Map<string, Answer[]>();
      for (const a of wrong) bySubject.set(a.question.subjectKey, [...(bySubject.get(a.question.subjectKey) ?? []), a]);
      let added = 0;
      for (const [subjectKey, list] of bySubject) {
        const s = getSubject(subjectKey);
        const r = await addCardsToDeck({
          title: `Mistakes: ${s ? subjectLabel(s) : subjectKey}`, subject_key: subjectKey, source: 'mistake',
          cards: list.map((a) => ({
            front: a.question.q.slice(0, 500),
            back: `${a.question.options[a.question.correct]}${a.question.exp ? `\n\n${a.question.exp}` : ''}`.slice(0, 2000),
            topic_key: a.question.topicKey, skill_id: a.question.skillId, difficulty: a.question.difficulty, source_kind: 'mistake' as const,
          })),
        });
        added += r.added;
      }
      setCardsState('done');
      toast.success(added ? `Added ${added} card${added === 1 ? '' : 's'} to your mistakes deck.` : 'Those cards are already in your deck.');
    } catch (e) {
      setCardsState('idle');
      toast.error(errorMessage(e));
    }
  };

  if (!total) {
    return (
      <div className="page page--narrow">
        <EmptyState icon={<BookOpen />} title="No answers recorded" body="You left before answering anything, so there is nothing to summarise."
          actions={<><Button icon={<RotateCcw />} onClick={onAgain}>Start again</Button><ButtonLink to={back} variant="ghost">Done</ButtonLink></>} />
      </div>
    );
  }

  return (
    <div className="page page--narrow fade-up">
      <div className="results-hero">
        <ProgressRing value={pct / 100} size={120} stroke={9} label={`${pct}% correct`}
          color={pct >= 70 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--primary)'}>
          <div className="center"><div className="results-hero__pct num">{pct}%</div><div className="text-xs text-3">{correct}/{total}</div></div>
        </ProgressRing>
        <div>
          <p className="text-sm text-3 fw-500">{title}</p>
          <h1 className="page-header__title">{headline}</h1>
          <div className="row-sm row--wrap mt-3">
            <Badge tone="primary" icon={<Zap />}>+{xp} XP</Badge>
            <Badge icon={<Clock />}>{formatMinutes(seconds)}</Badge>
            {hinted > 0 && <Badge icon={<Lightbulb />}>{hinted} with a hint</Badge>}
            {queued && <Badge icon={<CloudOff />}>Some answers will sync when you're online</Badge>}
          </div>
          {advice && <p className="text-sm text-2 mt-3">{advice.body}</p>}
        </div>
      </div>

      {skills.length > 0 && (
        <Card className="mt-6">
          <h2 className="card__title mb-4">Skills practised</h2>
          <ul className="stack-sm" style={{ listStyle: 'none' }}>
            {skills.map((s) => {
              const delta = s.isNew ? 0 : s.after - s.before;
              return (
                <li key={s.skillId} className="row row--between text-sm">
                  <span className="truncate">{s.name}</span>
                  <span className="row-sm shrink-0">
                    <span className="num text-2">{s.correct}/{s.total}</span>
                    <span className={`num mastery-delta ${delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-3'}`}
                      aria-label={s.isNew ? `New skill, mastery ${s.after}%` : `Mastery ${s.before}% to ${s.after}%`}>
                      {delta > 0 ? <TrendingUp size={14} aria-hidden="true" /> : delta < 0 ? <TrendingDown size={14} aria-hidden="true" /> : null}
                      {s.isNew ? <>New · {s.after}%</> : <>{s.before}% → {s.after}%</>}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {queued && <p className="text-xs text-3 mt-3">Mastery for answers saved offline updates once they sync.</p>}
        </Card>
      )}

      {misconceptions.length > 0 && (
        <Card className="mt-4">
          <h2 className="card__title mb-2">Patterns in your mistakes</h2>
          <ul className="stack-sm text-sm" style={{ paddingLeft: 18 }}>
            {misconceptions.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <p className="text-xs text-3 mt-3">Chapter tracks these and marks them resolved once you avoid the same trap twice.</p>
        </Card>
      )}

      <Card className="mt-4" accent>
        <h2 className="card__title mb-2">Next step</h2>
        {weakest ? (
          <>
            <p className="text-sm text-2">{weakest.name} needs the most work from this session.</p>
            <div className="row row--wrap mt-3">
              <ButtonLink to={`/practice?mode=guided&skill=${encodeURIComponent(weakest.skillId)}`} icon={<Target />}>Guided practice on this skill</ButtonLink>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-2">Everything went well. Chapter will schedule these skills for review so they stick.</p>
            <div className="row row--wrap mt-3">
              <ButtonLink to="/practice?mode=review" variant="secondary">Check what's due for review</ButtonLink>
            </div>
          </>
        )}
      </Card>

      {wrong.length > 0 && (
        <Card className="mt-4" flush>
          <div className="row row--between row--wrap" style={{ padding: '20px 20px 4px' }}>
            <h2 className="card__title">Questions to learn from</h2>
            <Button variant="secondary" size="sm" icon={<Layers />} onClick={makeCards} loading={cardsState === 'busy'} disabled={cardsState === 'done'}>
              {cardsState === 'done' ? 'Added to flashcards' : 'Turn into flashcards'}
            </Button>
          </div>
          <ul className="list list--padded">
            {wrong.map((a, i) => (
              <li key={a.question.ref} className="list__item" style={{ display: 'block' }}>
                <p className="text-base" style={{ whiteSpace: 'pre-line' }}>{a.question.q}</p>
                <p className="text-sm mt-2"><span className="text-danger">Your answer: {a.question.options[a.chosen]}</span></p>
                <p className="text-sm"><span className="text-success">Correct: {a.question.options[a.question.correct]}</span></p>
                {a.misconception && <p className="text-sm text-2 mt-1">Likely cause: {a.misconception}</p>}
                {a.question.exp && <p className="text-sm text-2 mt-2">{a.question.exp}</p>}
                {explaining === i ? (
                  <InlineExplain ctx={{ question: a.question.q, options: a.question.options, chosen: a.question.options[a.chosen], correct: a.question.options[a.question.correct], explanation: a.question.exp, subjectKey: a.question.subjectKey, topicKey: a.question.topicKey }} />
                ) : (
                  <Button variant="ghost" size="sm" icon={<Sparkles />} className="mt-2" onClick={() => setExplaining(i)}>Explain with the tutor</Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="row row--wrap mt-6">
        <Button icon={<RotateCcw />} onClick={onAgain}>Practise again</Button>
        <ButtonLink to={back} variant="ghost" icon={<HomeIcon />}>Done</ButtonLink>
      </div>
      <p className="text-xs text-3 mt-4">Mastery, weak skills and your review schedule are updated on the server. <Link to="/progress" className="text-primary">See progress</Link></p>
    </div>
  );
}
