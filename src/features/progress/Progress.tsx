import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Activity, AlertTriangle, ChevronDown, Clock, Flame, RotateCcw, Target, TrendingDown, TrendingUp, BarChart3 } from 'lucide-react';
import { useProfile, useStudentSubjects } from '@/data/profile';
import { useActivity, useRecentSessions, useTopicStats } from '@/data/progress';
import { useDueReviews, useMisconceptions, useSkillMastery } from '@/data/learning';
import { skillById } from '@/content/skills';
import { skillTrend } from '@/lib/mastery';
import { Page, PageHeader, Section, useTitle } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { ColumnChart, Heatmap, Meter, type HeatCell } from '@/components/charts';
import { SubjectIcon } from '@/components/SubjectIcon';
import { getSubject, getTopic, subjectLabel } from '@/content/catalog';
import { BAND_LABEL, masteryTone, summarizeSubject, EVIDENCE_TARGET } from '@/lib/mastery';
import { currentStreak } from '@/lib/streak';
import { addDays, dayRange, formatDay, formatMinutes, relativeTime, todayIn, weekStart } from '@/lib/dates';
import { fmtInt } from '@/lib/format';

export default function Progress() {
  useTitle('Progress');
  const profile = useProfile();
  const subjects = useStudentSubjects();
  const stats = useTopicStats();
  const activity = useActivity();
  const sessions = useRecentSessions(8);
  const [open, setOpen] = useState<string | null>(null);

  const tz = profile.data?.timezone ?? 'UTC';
  const today = todayIn(tz);
  const chosen = useMemo(() => (subjects.data ?? []).map((s) => s.subject_key), [subjects.data]);
  const extra = useMemo(() => [...new Set((stats.data ?? []).map((s) => s.subject_key))].filter((k) => !chosen.includes(k)), [stats.data, chosen]);
  const allSubjects = [...chosen, ...extra];

  const totals = useMemo(() => {
    const s = stats.data ?? [];
    const answered = s.reduce((a, t) => a + t.attempts, 0);
    const correct = s.reduce((a, t) => a + t.correct, 0);
    const last30 = (activity.data ?? []).filter((a) => a.day > addDays(today, -30));
    return {
      answered,
      accuracy: answered ? Math.round((correct / answered) * 100) : null,
      minutes30: last30.reduce((a, d) => a + d.practice_seconds, 0),
      activeDays30: last30.filter((d) => d.questions > 0 || d.reviews > 0).length,
    };
  }, [stats.data, activity.data, today]);

  const heat = useMemo(() => {
    const byDay = new Map((activity.data ?? []).map((a) => [a.day, a]));
    const end = today;
    const start = weekStart(addDays(end, -7 * 17));
    const weeks: Array<Array<HeatCell | null>> = [];
    let week: Array<HeatCell | null> = [];
    for (const d of dayRange(start, addDays(weekStart(end), 6))) {
      const a = byDay.get(d);
      week.push(d > end ? null : { day: d, value: (a?.questions ?? 0) + (a?.reviews ?? 0), title: formatDay(d, { weekday: 'short', day: 'numeric', month: 'short' }) });
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    return weeks;
  }, [activity.data, today]);

  const weekly = useMemo(() => {
    const out = [];
    for (let i = 7; i >= 0; i--) {
      const ws = weekStart(addDays(today, -7 * i));
      const rows = (activity.data ?? []).filter((a) => a.day >= ws && a.day <= addDays(ws, 6));
      const q = rows.reduce((s, a) => s + a.questions, 0);
      const c = rows.reduce((s, a) => s + a.correct, 0);
      out.push({
        key: ws,
        label: formatDay(ws, { day: 'numeric', month: 'short' }),
        title: `Week of ${formatDay(ws, { day: 'numeric', month: 'long' })}`,
        value: q ? Math.round((c / q) * 100) : 0,
        detail: q ? `${q} questions` : 'No questions',
        highlight: i === 0,
      });
    }
    return out;
  }, [activity.data, today]);

  const skillMastery = useSkillMastery();
  const misconceptions = useMisconceptions();
  const due = useDueReviews();
  const weakSkills = useMemo(() => (skillMastery.data ?? [])
    .filter((m) => m.attempts >= 2 && m.mastery < 60)
    .sort((x, y) => x.mastery - y.mastery).slice(0, 12), [skillMastery.data]);
  const openMisconceptions = useMemo(() => (misconceptions.data ?? []).filter((m) => !m.resolved_at && m.misconception), [misconceptions.data]);
  const resolvedCount = (misconceptions.data ?? []).filter((m) => m.resolved_at).length;
  const loading = stats.isLoading || activity.isLoading || profile.isLoading;
  const error = stats.error || activity.error;
  const streak = profile.data ? currentStreak(profile.data) : 0;
  const hasData = (stats.data?.length ?? 0) > 0;

  return (
    <Page>
      <PageHeader title="Progress" subtitle="Everything here is calculated from your own answers." actions={<ButtonLink to="/reports" variant="secondary">Weekly report</ButtonLink>} />

      {error ? <ErrorState error={error} onRetry={() => { stats.refetch(); activity.refetch(); }} /> : (
        <>
          <div className="grid-4">
            <Card tight><div className="stat"><span className="stat__label"><Target aria-hidden="true" /> Questions answered</span><span className="stat__value">{loading ? '–' : fmtInt(totals.answered)}</span></div></Card>
            <Card tight><div className="stat"><span className="stat__label"><TrendingUp aria-hidden="true" /> Accuracy</span><span className="stat__value">{loading || totals.accuracy == null ? '–' : `${totals.accuracy}%`}</span><span className="stat__foot">all time</span></div></Card>
            <Card tight><div className="stat"><span className="stat__label"><Clock aria-hidden="true" /> Practice time</span><span className="stat__value">{loading ? '–' : formatMinutes(totals.minutes30)}</span><span className="stat__foot">last 30 days</span></div></Card>
            <Card tight><div className="stat"><span className="stat__label"><Flame aria-hidden="true" /> Streak</span><span className="stat__value">{loading ? '–' : streak}<small>days</small></span><span className="stat__foot">best {profile.data?.longest_streak ?? 0}</span></div></Card>
          </div>

          {!loading && !hasData ? (
            <Card className="mt-6">
              <EmptyState icon={<BarChart3 />} title="Your progress will build up here"
                body="Answer your first questions and Chapter will start tracking mastery, accuracy and study time for every topic."
                actions={<ButtonLink to="/practice?mode=daily&count=10">Start practising</ButtonLink>} />
            </Card>
          ) : (
            <>
              <div className="grid-2 mt-6">
                <Card>
                  <h2 className="card__title">Consistency</h2>
                  <p className="card__sub mb-4">Questions and flashcard reviews per day · studied on {totals.activeDays30} of the last 30 days</p>
                  {loading ? <Skeleton height={120} /> : <Heatmap weeks={heat} caption="Daily study activity, last 18 weeks" unit="items" />}
                </Card>
                <Card>
                  <h2 className="card__title">Accuracy by week</h2>
                  <p className="card__sub mb-4">Share of answers correct each week</p>
                  {loading ? <Skeleton height={140} /> : <ColumnChart data={weekly} unit="% correct" caption="Weekly accuracy, last 8 weeks" height={130} />}
                </Card>
              </div>

              {(due.data?.length ?? 0) > 0 && (
                <Card className="mt-6 row row--wrap" accent>
                  <RotateCcw size={20} className="text-primary shrink-0" aria-hidden="true" />
                  <div className="grow">
                    <p className="fw-600">{due.data!.length} skill{due.data!.length === 1 ? ' is' : 's are'} due for review</p>
                    <p className="text-sm text-2">Reviewing just before you would forget is what makes learning stick.</p>
                  </div>
                  <ButtonLink to="/practice?mode=review" size="sm">Review now</ButtonLink>
                </Card>
              )}

              <Section title="Skills to work on" id="weak-h">
                <Card flush>
                  {skillMastery.isLoading ? <div style={{ padding: 20 }}><Skeleton height={48} /></div> : skillMastery.error ? (
                    <ErrorState compact error={skillMastery.error} onRetry={() => skillMastery.refetch()} />
                  ) : weakSkills.length ? (
                    <ul className="list list--padded">
                      {weakSkills.map((m) => {
                        const skill = skillById(m.skill_id);
                        const subject = getSubject(skill?.subjectKey);
                        const trend = skillTrend(m);
                        return (
                          <li key={m.skill_id} className="list__item">
                            <SubjectIcon subjectKey={skill?.subjectKey ?? null} size="sm" />
                            <div className="list__main">
                              <p className="list__title">{skill?.name ?? m.skill_id}</p>
                              <p className="list__sub">
                                {subject ? subjectLabel(subject) : ''}{skill ? ` · ${getTopic(skill.subjectKey, skill.topicKey)?.name ?? ''}` : ''} · mastery {m.mastery}% after {m.attempts} answers
                                {m.last_practiced_at ? ` · ${relativeTime(m.last_practiced_at)}` : ''}
                              </p>
                            </div>
                            {trend !== 'steady' && (
                              <span className={`text-xs row-sm ${trend === 'improving' ? 'text-success' : 'text-danger'}`}>
                                {trend === 'improving' ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />}
                                {trend === 'improving' ? 'Improving' : 'Slipping'}
                              </span>
                            )}
                            <ButtonLink to={`/practice?mode=guided&skill=${encodeURIComponent(m.skill_id)}`} size="sm" variant="secondary" aria-label={`Guided practice: ${skill?.name ?? m.skill_id}`}>Guided</ButtonLink>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <EmptyState compact icon={<Activity />} title="No weak skills flagged"
                      body="A skill is flagged when its mastery is below 60% after at least two answers. Mastery weighs how hard each question was." />
                  )}
                </Card>
              </Section>

              <Section title="Recurring mistakes" id="misconceptions-h">
                <Card flush>
                  {misconceptions.isLoading ? <div style={{ padding: 20 }}><Skeleton height={48} /></div> : misconceptions.error ? (
                    <ErrorState compact error={misconceptions.error} onRetry={() => misconceptions.refetch()} />
                  ) : openMisconceptions.length ? (
                    <ul className="list list--padded">
                      {openMisconceptions.map((m) => {
                        const skill = skillById(m.misconception!.skill_id);
                        return (
                          <li key={m.misconception_id} className="list__item">
                            <AlertTriangle size={18} className="text-warning shrink-0" aria-hidden="true" />
                            <div className="list__main">
                              <p className="list__title" style={{ whiteSpace: 'normal' }}>{m.misconception!.description}</p>
                              <p className="list__sub">{skill?.name ?? ''} · seen {m.evidence_count} time{m.evidence_count === 1 ? '' : 's'} · last {relativeTime(m.last_seen_at)}</p>
                            </div>
                            <ButtonLink to={`/practice?mode=guided&skill=${encodeURIComponent(m.misconception!.skill_id)}`} size="sm" variant="secondary">Practise</ButtonLink>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <EmptyState compact icon={<Target />} title="No recurring mistakes right now"
                      body={resolvedCount ? `You have moved past ${resolvedCount} earlier mistake pattern${resolvedCount === 1 ? '' : 's'}.` : 'When a wrong answer matches a known misconception, Chapter tracks it here until you avoid it twice.'} />
                  )}
                </Card>
              </Section>

              <Section title="Subjects & topics" id="subjects-h">
                <p className="text-sm text-3 mb-4">
                  Mastery blends recent and overall accuracy, and needs about {EVIDENCE_TARGET} answers in a topic to reach full confidence. Subject mastery counts topics you haven't started as 0%.
                </p>
                <div className="stack-sm">
                  {allSubjects.map((k) => {
                    const sum = summarizeSubject(k, stats.data ?? []);
                    if (!sum) return null;
                    const isOpen = open === k;
                    return (
                      <Card key={k} flush>
                        <button type="button" className="subject-toggle" aria-expanded={isOpen} aria-controls={`topics-${k}`} onClick={() => setOpen(isOpen ? null : k)}>
                          <SubjectIcon subjectKey={k} />
                          <div className="grow" style={{ minWidth: 0 }}>
                            <div className="row row--between">
                              <span className="fw-600 truncate">{subjectLabel(sum.subject)}</span>
                              <span className="num fw-600">{sum.mastery}%</span>
                            </div>
                            <Meter value={sum.mastery} label={`${subjectLabel(sum.subject)} mastery`} tone={masteryTone(sum.mastery, sum.attempts)} />
                            <p className="text-xs text-3 mt-1">{sum.topicsStarted}/{sum.topics.length} topics · {sum.attempts} answers{sum.accuracy != null ? ` · ${sum.accuracy}% correct` : ''}</p>
                          </div>
                          <ChevronDown size={18} className={`text-3 chev${isOpen ? ' is-open' : ''}`} aria-hidden="true" />
                        </button>
                        {isOpen && (
                          <ul id={`topics-${k}`} className="list list--padded" style={{ borderTop: '1px solid var(--border)' }}>
                            {sum.topics.map((t) => (
                              <li key={t.topicKey} className="list__item">
                                <div className="list__main">
                                  <div className="row row--between text-sm">
                                    <span>{t.name}</span>
                                    <Badge tone={masteryTone(t.mastery, t.attempts) === 'neutral' ? 'neutral' : masteryTone(t.mastery, t.attempts)}>{BAND_LABEL[t.band]}</Badge>
                                  </div>
                                  <div className="topic-row__meter"><Meter value={t.mastery} label={`${t.name} mastery`} tone={masteryTone(t.mastery, t.attempts)} /><span className="text-xs text-3 num">{t.attempts ? `${t.mastery}%` : ''}</span></div>
                                  <p className="list__sub">{t.attempts ? `${t.accuracy}% correct · ${t.attempts} answers` : 'Not started'}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </Section>

              <Section title="Recent sessions" id="sessions-h">
                <Card flush>
                  {sessions.isLoading ? <div style={{ padding: 20 }}><Skeleton height={48} /></div> : sessions.data?.length ? (
                    <ul className="list list--padded">
                      {sessions.data.map((s) => {
                        const subj = getSubject(s.subject_key);
                        const topicName = s.subject_key && s.topic_key ? getTopic(s.subject_key, s.topic_key)?.name : null;
                        return (
                          <li key={s.id} className="list__item">
                            <SubjectIcon subjectKey={s.subject_key} size="sm" />
                            <div className="list__main">
                              <p className="list__title">{topicName ?? (subj ? subjectLabel(subj) : s.mode === 'review' ? 'Mistake review' : 'Smart mix')}</p>
                              <p className="list__sub">{relativeTime(s.started_at)} · {s.question_count} questions · {formatMinutes(s.practice_seconds)}</p>
                            </div>
                            <span className="num fw-600">{Math.round((s.correct_count / Math.max(1, s.question_count)) * 100)}%</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <EmptyState compact title="No sessions yet" />}
                </Card>
              </Section>
              <p className="text-xs text-3 mt-4">Looking for goal progress? <Link to="/goals" className="text-primary">Open Goals</Link></p>
            </>
          )}
        </>
      )}
    </Page>
  );
}
