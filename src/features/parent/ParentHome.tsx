import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AlertCircle, Calendar, Clock, Flame, KeyRound, Target, TrendingUp, UserMinus, Users, Flag } from 'lucide-react';
import { useAcceptInvite, useMyStudents, useRemoveLink, useStudentOverview, type StudentOverview } from '@/data/social';
import { useProfile } from '@/data/profile';
import { Page, PageHeader, Section, useTitle } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/Progress';
import { Alert, EmptyState, ErrorState, PageLoader, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { ColumnChart, Meter } from '@/components/charts';
import { SubjectIcon } from '@/components/SubjectIcon';
import { getSubject, subjectLabel } from '@/content/catalog';
import { masteryTone, summarizeSubject, weakTopics } from '@/lib/mastery';
import { currentStreak } from '@/lib/streak';
import { addDays, dayRange, daysBetween, formatDay, formatMinutes, weekdayShort } from '@/lib/dates';
import { goalProgress, STATUS_LABEL } from '@/lib/goals';
import { errorMessage } from '@/lib/errors';
import { firstName } from '@/lib/format';
import type { Goal, PaperAttempt } from '@/lib/types';
import { GOAL_TITLE } from '@/features/goals/goalText';

export default function ParentHome() {
  useTitle('Parent overview');
  const { studentId } = useParams();
  const navigate = useNavigate();
  const profile = useProfile();
  const students = useMyStudents();
  const [addOpen, setAddOpen] = useState(false);

  if (students.isLoading) return <Page><PageLoader /></Page>;
  if (students.error) return <Page><ErrorState error={students.error} onRetry={() => students.refetch()} /></Page>;
  const list = students.data ?? [];
  const selected = list.find((s) => s.student_id === studentId) ?? list[0];

  if (!list.length) {
    return (
      <Page width="narrow">
        <PageHeader title={`Welcome${profile.data?.display_name ? `, ${firstName(profile.data.display_name)}` : ''}`}
          subtitle="Link your student's account to follow their progress." />
        <LinkStudentCard onLinked={(id) => navigate(`/parent/${id}`, { replace: true })} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Parent overview" subtitle="Progress your student has chosen to share with you."
        actions={<Button variant="secondary" icon={<KeyRound />} onClick={() => setAddOpen(true)}>Link another student</Button>} />
      {list.length > 1 && (
        <nav className="chip-row mb-6" aria-label="Students">
          {list.map((s) => (
            <Link key={s.student_id} to={`/parent/${s.student_id}`} className="chip" aria-pressed={s.student_id === selected.student_id}>{s.name}</Link>
          ))}
        </nav>
      )}
      <StudentOverviewView studentId={selected.student_id} />
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Link another student">
        <LinkStudentCard bare onLinked={(id) => { setAddOpen(false); navigate(`/parent/${id}`); }} />
      </Dialog>
    </Page>
  );
}

function LinkStudentCard({ onLinked, bare }: { onLinked: (studentId: string) => void; bare?: boolean }) {
  const accept = useAcceptInvite();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (clean.length !== 8) return setError('The code has 8 characters, like ABCD-2345.');
    accept.mutate(clean, {
      onSuccess: (r) => {
        if (r.ok && r.student_id) onLinked(r.student_id);
        else setError(r.reason === 'too_many_attempts' ? 'Too many incorrect codes. Please try again in an hour.' : 'That code is not valid or has expired. Ask your student for a new one.');
      },
      onError: (err) => setError(errorMessage(err)),
    });
  };

  const body = (
    <form className="stack" onSubmit={submit}>
      <ol className="insights text-sm">
        <li>Your student opens <strong>Settings → Parent access</strong> in their Chapter account.</li>
        <li>They generate a one-time code (it expires after 48 hours).</li>
        <li>Enter it below.</li>
      </ol>
      {error && <Alert tone="danger" icon={<AlertCircle />}>{error}</Alert>}
      <Field label="Student's code">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-2345" autoComplete="off" autoCapitalize="characters" maxLength={9} className="input invite-input" />
      </Field>
      <Button type="submit" loading={accept.isPending}>Link account</Button>
      <p className="text-xs text-3">You'll see activity, subject mastery, weak topics, goals and past-paper scores. Tutor conversations, notes and flashcards stay private to your student.</p>
    </form>
  );
  return bare ? body : <Card><div className="row mb-4"><span className="state__icon" style={{ margin: 0 }} aria-hidden="true"><Users /></span><h2 className="card__title">Link your student</h2></div>{body}</Card>;
}

function StudentOverviewView({ studentId }: { studentId: string }) {
  const o = useStudentOverview(studentId);
  const remove = useRemoveLink();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);

  const derived = useMemo(() => (o.data ? derive(o.data) : null), [o.data]);
  if (o.isLoading) return <div className="stack"><Skeleton height={100} /><Skeleton height={220} /></div>;
  if (o.error || !o.data || !derived) return <ErrorState error={o.error} onRetry={() => o.refetch()} />;
  const { student } = o.data;
  const d = derived;

  return (
    <>
      <div className="row row--between row--wrap mb-4">
        <h2 className="text-xl fw-600">{student.name}</h2>
        <Badge>{student.program === 'sat' ? 'SAT' : `IGCSE${student.igcse_tier ? ` · ${student.igcse_tier === 'core' ? 'Core' : 'Extended'}` : ''}`}</Badge>
      </div>

      <div className="grid-4">
        <Card tight><div className="stat"><span className="stat__label"><Flame aria-hidden="true" /> Streak</span><span className="stat__value">{d.streak}<small>days</small></span><span className="stat__foot">{student.last_study_date ? `last studied ${formatDay(student.last_study_date)}` : 'not started'}</span></div></Card>
        <Card tight><div className="stat"><span className="stat__label"><Target aria-hidden="true" /> Questions (7 days)</span><span className="stat__value">{d.week.questions}</span></div></Card>
        <Card tight><div className="stat"><span className="stat__label"><TrendingUp aria-hidden="true" /> Accuracy (7 days)</span><span className="stat__value">{d.week.accuracy == null ? '–' : `${d.week.accuracy}%`}</span></div></Card>
        <Card tight><div className="stat"><span className="stat__label"><Clock aria-hidden="true" /> Practice (7 days)</span><span className="stat__value">{formatMinutes(d.week.seconds)}</span><span className="stat__foot">{d.week.days} of 7 days active</span></div></Card>
      </div>

      <div className="layout-main-side mt-6">
        <div className="stack-lg">
          <Card>
            <h3 className="card__title">Daily activity, last 14 days</h3>
            <div className="mt-4"><ColumnChart data={d.days} unit="questions" caption={`${student.name}'s questions per day, last 14 days`} height={140} /></div>
          </Card>

          <Section title="Subjects" id="p-subj">
            <Card>
              {d.subjects.length ? (
                <ul className="stack" style={{ listStyle: 'none' }}>
                  {d.subjects.map((s) => (
                    <li key={s.subject.key} className="row">
                      <SubjectIcon subjectKey={s.subject.key} size="sm" />
                      <div className="grow">
                        <div className="row row--between text-sm"><span className="fw-500">{subjectLabel(s.subject)}</span><span className="num text-2">{s.attempts ? `${s.mastery}% mastery · ${s.accuracy}% correct` : 'Not started'}</span></div>
                        <Meter value={s.mastery} label={`${subjectLabel(s.subject)} mastery`} tone={masteryTone(s.mastery, s.attempts)} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState compact title="No subjects chosen yet" />}
            </Card>
          </Section>

          <Section title="Skills that need work" id="p-weak">
            <Card flush>
              {o.data.skills?.weakest.length ? (
                <ul className="list list--padded">
                  {o.data.skills.weakest.map((w) => (
                    <li key={w.skill_id} className="list__item">
                      <SubjectIcon subjectKey={w.subject_key} size="sm" />
                      <div className="list__main"><p className="list__title">{w.name}</p><p className="list__sub">{getSubject(w.subject_key) ? subjectLabel(getSubject(w.subject_key)!) : ''} · mastery {w.mastery}% after {w.attempts} answers</p></div>
                    </li>
                  ))}
                </ul>
              ) : d.weak.length ? (
                <ul className="list list--padded">
                  {d.weak.map((w) => (
                    <li key={`${w.subjectKey}/${w.topicKey}`} className="list__item">
                      <SubjectIcon subjectKey={w.subjectKey} size="sm" />
                      <div className="list__main"><p className="list__title">{w.name}</p><p className="list__sub">{subjectLabel(getSubject(w.subjectKey)!)} · {w.accuracy}% correct over {w.attempts} answers</p></div>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState compact title="Nothing flagged" body="A skill is flagged when its mastery is below 60% after at least two answers." />}
              {o.data.skills && o.data.skills.practised > 0 && (
                <p className="text-xs text-3" style={{ padding: '0 16px 14px' }}>
                  {o.data.skills.secure} of {o.data.skills.practised} practised skills are secure · {o.data.skills.due_reviews} due for review · {o.data.skills.recurring_mistakes} recurring mistake pattern{o.data.skills.recurring_mistakes === 1 ? '' : 's'} being worked on
                </p>
              )}
            </Card>
          </Section>
        </div>

        <aside className="stack-lg">
          <Card>
            <h3 className="card__title row-sm"><Calendar size={16} aria-hidden="true" /> Exams</h3>
            {d.exams.length ? (
              <ul className="list mt-2">
                {d.exams.map((e) => (
                  <li key={e.subject_key} className="list__item">
                    <SubjectIcon subjectKey={e.subject_key} size="sm" />
                    <div className="list__main"><p className="list__title">{subjectLabel(getSubject(e.subject_key)!)}</p><p className="list__sub">{formatDay(e.exam_date!, { day: 'numeric', month: 'short', year: 'numeric' })}{e.target_grade ? ` · target ${e.target_grade}` : ''}</p></div>
                    <span className="exam-days num"><strong>{e.days}</strong> days</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-2 mt-2">No exam dates added yet.</p>}
          </Card>
          <Card>
            <h3 className="card__title row-sm"><Flag size={16} aria-hidden="true" /> Goals</h3>
            {d.goals.length ? (
              <ul className="stack mt-3" style={{ listStyle: 'none' }}>
                {d.goals.map(({ goal, progress }) => (
                  <li key={goal.id} className="stack-sm">
                    <div className="row row--between text-sm"><span className="fw-500">{GOAL_TITLE(goal)}</span><span className="text-3">{STATUS_LABEL[progress.status]}</span></div>
                    <ProgressBar value={progress.fraction} label={GOAL_TITLE(goal)} size="sm" tone={progress.status === 'met' ? 'success' : 'primary'} />
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-2 mt-2">No goals set.</p>}
          </Card>
          <Card>
            <h3 className="card__title">Recent past papers</h3>
            {o.data.papers.length ? (
              <ul className="list mt-2">
                {o.data.papers.slice(0, 5).map((p, i) => (
                  <li key={`${p.title}-${i}`} className="list__item">
                    <div className="list__main"><p className="list__title">{p.title}</p><p className="list__sub">{formatDay(p.completed_on)}</p></div>
                    <span className="num fw-600">{Math.round((Number(p.score) / Number(p.max_score)) * 100)}%</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-2 mt-2">No papers logged yet.</p>}
          </Card>
          <Button variant="ghost" icon={<UserMinus />} onClick={() => setConfirm(true)}>Stop following {student.name}</Button>
        </aside>
      </div>

      <Dialog open={confirm} onClose={() => setConfirm(false)} title={`Stop following ${student.name}?`} description="You'll need a new code from your student to link again."
        footer={<>
          <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(studentId, { onSuccess: () => { setConfirm(false); navigate('/parent', { replace: true }); }, onError: (e) => toast.error(errorMessage(e)) })}>Unlink</Button>
        </>} />
    </>
  );
}

function derive(o: StudentOverview) {
  const today = o.student.today;
  const since = addDays(today, -6);
  const lastWeek = o.activity.filter((a) => a.day >= since);
  const q = lastWeek.reduce((s, a) => s + a.questions, 0);
  const c = lastWeek.reduce((s, a) => s + a.correct, 0);
  const days = dayRange(addDays(today, -13), today).map((day) => {
    const a = o.activity.find((x) => x.day === day);
    return { key: day, label: weekdayShort(day).slice(0, 1), title: formatDay(day, { weekday: 'long', day: 'numeric', month: 'short' }), value: a?.questions ?? 0, highlight: day === today };
  });
  const stats = o.topic_stats.map((t) => ({ ...t }));
  const subjects = o.subjects.map((s) => summarizeSubject(s.subject_key, stats)).filter((x) => !!x);
  const papers: PaperAttempt[] = o.papers.map((p, i) => ({ id: String(i), paper_id: null, duration_minutes: null, reflection: null, created_at: '', ...p }));
  const activity = o.activity.map((a) => ({ ...a }));
  return {
    streak: currentStreak({ streak_days: o.student.streak_days, last_study_date: o.student.last_study_date, timezone: o.student.timezone }),
    week: { questions: q, accuracy: q ? Math.round((c / q) * 100) : null, seconds: lastWeek.reduce((s, a) => s + a.practice_seconds, 0), days: lastWeek.filter((a) => a.questions > 0 || a.reviews > 0).length },
    days,
    subjects,
    weak: weakTopics(stats, o.subjects.map((s) => s.subject_key), 5),
    exams: o.subjects.filter((s) => s.exam_date && daysBetween(today, s.exam_date) >= 0).map((s) => ({ ...s, days: daysBetween(today, s.exam_date!) })).sort((a, b) => a.days - b.days),
    goals: o.goals.map((g) => {
      const goal = { ...g, archived_at: null } as unknown as Goal;
      return { goal, progress: goalProgress(goal, { activity, papers, today }) };
    }),
  };
}
