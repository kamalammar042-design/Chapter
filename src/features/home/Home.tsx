import { useMemo } from 'react';
import { Link, useLocation } from 'react-router';
import {
  AlertTriangle, ArrowRight, Calendar, Camera, CheckCircle2, ChevronRight, FileText, Flame, History, Layers, RotateCcw,
  Sparkles, Target, Zap, Flag,
} from 'lucide-react';
import { useProfile, useStudentSubjects } from '@/data/profile';
import { useActivity, useQuota, useRecentSessions, useTopicStats } from '@/data/progress';
import { useDueReviews, useMisconceptions, useSkillMastery } from '@/data/learning';
import { skillById } from '@/content/skills';
import { recommendNext, weakestSkills } from '@/lib/recommend';
import { useDecks, useGoals, usePaperAttempts } from '@/data/study';
import { Page, Section, useTitle } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/Progress';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { ColumnChart, Meter } from '@/components/charts';
import { SubjectIcon } from '@/components/SubjectIcon';
import { getSubject, getTopic, subjectLabel } from '@/content/catalog';
import { summarizeSubject, masteryTone } from '@/lib/mastery';
import { currentStreak, STUDY_DAY_QUESTIONS } from '@/lib/streak';
import { addDays, dayRange, daysBetween, formatDay, relativeTime, todayIn, weekdayShort, formatMinutes } from '@/lib/dates';
import { firstName, greeting, fmtInt } from '@/lib/format';
import { leagueFor } from '@/lib/league';
import { goalProgress, STATUS_LABEL } from '@/lib/goals';
import { GOAL_TITLE } from '@/features/goals/goalText';

export default function Home() {
  useTitle('Home');
  const location = useLocation();
  const profile = useProfile();
  const subjects = useStudentSubjects();
  const stats = useTopicStats();
  const activity = useActivity();
  const goals = useGoals();
  const papers = usePaperAttempts();
  const decks = useDecks();
  const quota = useQuota();
  const mastery = useSkillMastery();
  const misconceptions = useMisconceptions();
  const due = useDueReviews();
  const recent = useRecentSessions(1);

  const p = profile.data;
  const tz = p?.timezone ?? 'UTC';
  const today = todayIn(tz);
  const subjectKeys = useMemo(() => (subjects.data ?? []).map((s) => s.subject_key), [subjects.data]);
  const openMisconceptions = useMemo(() => (misconceptions.data ?? []).filter((m) => !m.resolved_at && m.misconception).slice(0, 2), [misconceptions.data]);
  // a skill already listed for its recurring mistake is not listed again as weak
  const weak = useMemo(() => {
    const shown = new Set(openMisconceptions.map((m) => m.misconception!.skill_id));
    return weakestSkills(mastery.data ?? [], 6).filter((w) => !shown.has(w.skill_id)).slice(0, 3);
  }, [mastery.data, openMisconceptions]);
  const todayActivity = activity.data?.find((a) => a.day === today);
  const questionsToday = todayActivity?.questions ?? 0;
  const dueCards = (decks.data ?? []).reduce((s, d) => s + d.due, 0);
  const hasAnyActivity = (stats.data?.length ?? 0) > 0;

  const week = useMemo(() => {
    const days = dayRange(addDays(today, -6), today);
    return days.map((d) => {
      const a = activity.data?.find((x) => x.day === d);
      return {
        key: d,
        label: weekdayShort(d).slice(0, 2),
        title: formatDay(d, { weekday: 'long', day: 'numeric', month: 'short' }),
        value: a?.questions ?? 0,
        detail: a && a.questions ? `${Math.round((a.correct / a.questions) * 100)}% correct · ${formatMinutes(a.practice_seconds)}` : undefined,
        highlight: d === today,
      };
    });
  }, [activity.data, today]);
  const weekTotal = week.reduce((s, d) => s + d.value, 0);

  const exams = useMemo(() => (subjects.data ?? [])
    .filter((s) => s.exam_date && daysBetween(today, s.exam_date) >= 0)
    .sort((a, b) => a.exam_date!.localeCompare(b.exam_date!))
    .slice(0, 3), [subjects.data, today]);

  const next = recommendNext({
    hasActivity: hasAnyActivity,
    due: due.data ?? [],
    mastery: mastery.data ?? [],
    misconceptions: misconceptions.data ?? [],
    examInDays: exams[0]?.exam_date ? daysBetween(today, exams[0].exam_date) : null,
    skillName: (id) => skillById(id)?.name ?? id.split('/')[2] ?? id,
  });
  const last = recent.data?.[0];
  const lastTopic = last?.subject_key && last.topic_key ? getTopic(last.subject_key, last.topic_key) : undefined;
  const showContinue = !!last && !!lastTopic && Date.now() - Date.parse(last.started_at) < 3 * 86_400_000;

  if (profile.error) return <Page><ErrorState error={profile.error} onRetry={() => profile.refetch()} /></Page>;

  const streak = p ? currentStreak(p) : 0;
  const league = leagueFor(p?.xp ?? 0);
  const welcome = (location.state as { welcome?: boolean } | null)?.welcome && !hasAnyActivity;

  return (
    <Page>
      <header className="home-hero">
        <div className="grow" style={{ minWidth: 0 }}>
          <p className="text-sm text-3 fw-500">{formatDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="page-header__title mt-1">
            {p ? `${greeting()}, ${firstName(p.display_name) || 'there'}` : <Skeleton width={260} height={30} />}
          </h1>
        </div>
        <div className="row-sm row--wrap">
          <Badge tone={streak > 0 ? 'warning' : 'neutral'} icon={<Flame />}>{streak > 0 ? `${streak}-day streak` : 'No streak yet'}</Badge>
          <Badge tone="primary" icon={<Zap />}>{fmtInt(p?.xp ?? 0)} XP · {league.current.name}</Badge>
        </div>
      </header>

      <div className="layout-main-side mt-6">
        <div className="stack-lg">
          {/* ---- next action -------------------------------------------------- */}
          <Card accent className="next-card">
            <div className="row row--top">
              <div className="grow">
                <p className="text-sm text-primary fw-600">{welcome ? 'Start here' : 'Recommended next'}</p>
                <h2 className="next-card__title">{next.title}</h2>
                <p className="text-2 mt-1">{next.body}</p>
              </div>
            </div>
            <div className="next-card__foot">
              <div className="grow" style={{ minWidth: 160 }}>
                {questionsToday >= STUDY_DAY_QUESTIONS ? (
                  <p className="text-sm row-sm text-success"><CheckCircle2 size={16} aria-hidden="true" /> Today counts towards your streak</p>
                ) : (
                  <>
                    <p className="text-sm text-2 mb-2">{questionsToday} of {STUDY_DAY_QUESTIONS} questions to keep your streak today</p>
                    <ProgressBar value={questionsToday} max={STUDY_DAY_QUESTIONS} label="Questions answered today towards streak" size="sm" />
                  </>
                )}
              </div>
              <ButtonLink to={next.to} size="lg" iconRight={<ArrowRight />}>
                {next.cta}
              </ButtonLink>
            </div>
          </Card>

          {!quota.isLoading && quota.data && !quota.data.unlimited && (quota.data.remaining ?? 100) <= 20 && (
            <Card tight className="row row--between row--wrap">
              <div>
                <p className="fw-600">{quota.data.remaining} practice questions left this month</p>
                <p className="text-sm text-2">They reset on {quota.data.resets_on ? formatDay(quota.data.resets_on, { day: 'numeric', month: 'long' }) : 'the 1st'}.</p>
              </div>
              <ButtonLink to="/settings/usage" variant="secondary" size="sm">Your allowance</ButtonLink>
            </Card>
          )}

          {showContinue && (
            <Card tight className="row row--wrap">
              <History size={18} className="text-3 shrink-0" aria-hidden="true" />
              <div className="grow" style={{ minWidth: 0 }}>
                <p className="fw-600 truncate">Continue {lastTopic!.name}</p>
                <p className="text-sm text-2">{last!.correct_count}/{last!.question_count} correct · {relativeTime(last!.started_at)}</p>
              </div>
              <ButtonLink to={`/practice?subject=${last!.subject_key}&topic=${last!.topic_key}&mode=practice`} variant="secondary" size="sm">Continue</ButtonLink>
            </Card>
          )}

          {/* ---- quick tools --------------------------------------------------- */}
          <div className="quick-tools">
            <Link to="/tutor" className="quick-tool"><Sparkles aria-hidden="true" /><span>Ask the tutor</span></Link>
            <Link to="/tutor?mode=scan" className="quick-tool"><Camera aria-hidden="true" /><span>Scan a question</span></Link>
            <Link to="/review" className="quick-tool">
              <Layers aria-hidden="true" /><span>Flashcards</span>
              {dueCards > 0 && <Badge tone="primary">{dueCards} due</Badge>}
            </Link>
            <Link to="/papers" className="quick-tool"><FileText aria-hidden="true" /><span>Past papers</span></Link>
          </div>

          {/* ---- needs attention: weak skills, recurring mistakes, reviews ------------ */}
          <Section title="Needs attention" id="weak-h" action={<Link to="/progress" className="section__link">All skills <ChevronRight aria-hidden="true" /></Link>}>
            <Card flush>
              {mastery.isLoading ? (
                <div className="stack" style={{ padding: 20 }}><Skeleton height={44} /><Skeleton height={44} /></div>
              ) : mastery.error ? (
                <ErrorState compact error={mastery.error} onRetry={() => mastery.refetch()} />
              ) : weak.length || openMisconceptions.length || (due.data?.length ?? 0) > 0 ? (
                <ul className="list list--padded">
                  {(due.data?.length ?? 0) > 0 && (
                    <li className="list__item">
                      <span className="subject-icon subject-icon--sm" aria-hidden="true"><RotateCcw /></span>
                      <div className="list__main">
                        <p className="list__title">Spaced review</p>
                        <p className="list__sub">{due.data!.length} skill{due.data!.length === 1 ? '' : 's'} due today</p>
                      </div>
                      <ButtonLink to="/practice?mode=review" variant="secondary" size="sm">Review</ButtonLink>
                    </li>
                  )}
                  {openMisconceptions.map((m) => (
                    <li key={m.misconception_id} className="list__item">
                      <span className="subject-icon subject-icon--sm" aria-hidden="true"><AlertTriangle /></span>
                      <div className="list__main">
                        <p className="list__title">{skillById(m.misconception!.skill_id)?.name ?? 'Recurring mistake'}</p>
                        <p className="list__sub">{m.misconception!.description}</p>
                      </div>
                      <ButtonLink to={`/practice?mode=guided&skill=${encodeURIComponent(m.misconception!.skill_id)}`} variant="secondary" size="sm">Fix</ButtonLink>
                    </li>
                  ))}
                  {weak.map((w) => {
                    const skill = skillById(w.skill_id);
                    const subject = getSubject(skill?.subjectKey);
                    return (
                      <li key={w.skill_id} className="list__item">
                        <SubjectIcon subjectKey={skill?.subjectKey ?? null} size="sm" />
                        <div className="list__main">
                          <p className="list__title">{skill?.name ?? w.skill_id}</p>
                          <p className="list__sub">{subject ? subjectLabel(subject) : ''} · mastery {w.mastery}% after {w.attempts} answers</p>
                        </div>
                        <ButtonLink to={`/practice?mode=guided&skill=${encodeURIComponent(w.skill_id)}`} variant="secondary" size="sm">Practise</ButtonLink>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState compact icon={<Target />} title={hasAnyActivity ? 'Nothing needs attention right now' : 'Nothing to flag yet'}
                  body={hasAnyActivity ? 'Keep practising. Chapter flags a skill when its mastery drops below 60%, and brings skills back for review before you forget them.' : 'Answer a few questions and Chapter will show the skills that need work here.'} />
              )}
            </Card>
          </Section>

          {/* ---- this week -------------------------------------------------- */}
          <Section title="This week" id="week-h" action={<Link to="/reports" className="section__link">Weekly report <ChevronRight aria-hidden="true" /></Link>}>
            <Card>
              {activity.isLoading ? <Skeleton height={180} /> : activity.error ? (
                <ErrorState compact error={activity.error} onRetry={() => activity.refetch()} />
              ) : weekTotal === 0 ? (
                <EmptyState compact icon={<Zap />} title="No questions this week yet"
                  body="Your daily activity will appear here. Five questions a day keeps your streak going." />
              ) : (
                <>
                  <p className="text-sm text-2 mb-4"><span className="fw-600" style={{ color: 'var(--text)' }}>{weekTotal}</span> questions answered in the last 7 days</p>
                  <ColumnChart data={week} unit="questions" caption="Questions answered per day, last 7 days" height={140} />
                </>
              )}
            </Card>
          </Section>
        </div>

        {/* ---- side column ---------------------------------------------------- */}
        <aside className="stack-lg" aria-label="Overview">
          <Card>
            <h2 className="card__title row-sm"><Calendar size={16} aria-hidden="true" /> Upcoming exams</h2>
            {subjects.isLoading ? <Skeleton height={60} className="mt-3" /> : exams.length ? (
              <ul className="list mt-2">
                {exams.map((e) => {
                  const days = daysBetween(today, e.exam_date!);
                  const s = getSubject(e.subject_key);
                  return (
                    <li key={e.subject_key} className="list__item">
                      <SubjectIcon subjectKey={e.subject_key} size="sm" />
                      <div className="list__main">
                        <p className="list__title">{s ? subjectLabel(s) : e.subject_key}</p>
                        <p className="list__sub">{formatDay(e.exam_date!, { day: 'numeric', month: 'short', year: 'numeric' })}{e.target_grade ? ` · target ${e.target_grade}` : ''}</p>
                      </div>
                      <span className="exam-days num"><strong>{days}</strong> {days === 1 ? 'day' : 'days'}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-2">
                <p className="text-sm text-2">Add your exam dates to see a countdown and get a plan that fits.</p>
                <ButtonLink to="/settings/study" variant="secondary" size="sm" className="mt-3">Add exam dates</ButtonLink>
              </div>
            )}
          </Card>

          <Card>
            <div className="row row--between">
              <h2 className="card__title row-sm"><Flag size={16} aria-hidden="true" /> Goals</h2>
              <Link to="/goals" className="section__link">Manage</Link>
            </div>
            {goals.isLoading ? <Skeleton height={60} className="mt-3" /> : (goals.data?.length ?? 0) > 0 ? (
              <ul className="stack mt-3" style={{ listStyle: 'none' }}>
                {goals.data!.slice(0, 3).map((g) => {
                  const gp = goalProgress(g, { activity: activity.data ?? [], papers: papers.data ?? [], today });
                  return (
                    <li key={g.id} className="stack-sm">
                      <div className="row row--between text-sm">
                        <span className="fw-500 truncate">{GOAL_TITLE(g)}</span>
                        <span className={gp.status === 'met' ? 'text-success' : gp.status === 'behind' ? 'text-warning' : 'text-3'}>{STATUS_LABEL[gp.status]}</span>
                      </div>
                      <ProgressBar value={gp.fraction} label={GOAL_TITLE(g)} tone={gp.status === 'met' ? 'success' : 'primary'} size="sm" />
                      <p className="text-xs text-3">{gp.valueLabel}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-2">
                <p className="text-sm text-2">Set a weekly target, like 100 questions or two past papers.</p>
                <ButtonLink to="/goals?new=1" variant="secondary" size="sm" className="mt-3">Set a goal</ButtonLink>
              </div>
            )}
          </Card>

          <Card>
            <div className="row row--between">
              <h2 className="card__title">Subjects</h2>
              <Link to="/study" className="section__link">Study</Link>
            </div>
            {stats.isLoading || subjects.isLoading ? <Skeleton height={100} className="mt-3" /> : (
              <ul className="stack mt-3" style={{ listStyle: 'none' }}>
                {subjectKeys.map((k) => {
                  const sum = summarizeSubject(k, stats.data ?? []);
                  if (!sum) return null;
                  return (
                    <li key={k}>
                      <Link to={`/study/${k}`} className="subject-row">
                        <SubjectIcon subjectKey={k} size="sm" />
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="row row--between text-sm">
                            <span className="fw-500 truncate">{subjectLabel(sum.subject)}</span>
                            <span className="text-3 num">{sum.attempts ? `${sum.mastery}%` : 'Not started'}</span>
                          </div>
                          <Meter value={sum.mastery} label={`${subjectLabel(sum.subject)} mastery`} tone={masteryTone(sum.mastery, sum.attempts)} />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </Page>
  );
}
