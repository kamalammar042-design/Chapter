import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BookOpen, CalendarDays, CheckCircle2, FileText, Info, Moon, RotateCcw, Target } from 'lucide-react';
import { getSubject, subjectLabel } from '@/content/catalog';
import { skillById, skillsFor } from '@/content/skills';
import { useProfile, useStudentSubjects, useUpdateProfile } from '@/data/profile';
import { useSkillMastery } from '@/data/learning';
import { useActivity } from '@/data/progress';
import { Page, PageHeader, Section, useTitle } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';
import { Badge, Segmented } from '@/components/ui/Badge';
import { Alert, EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { Meter } from '@/components/charts';
import { SubjectIcon } from '@/components/SubjectIcon';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';
import { formatDay, todayIn } from '@/lib/dates';
import { blockLink, buildExamPlan, type PlanBlock, type PlanSubject } from '@/lib/plan';

const KIND: Record<PlanBlock['kind'], { label: string; icon: ReactNode }> = {
  review: { label: 'Spaced review', icon: <RotateCcw aria-hidden="true" /> },
  learn: { label: 'Learn', icon: <BookOpen aria-hidden="true" /> },
  practise: { label: 'Practise', icon: <Target aria-hidden="true" /> },
  paper: { label: 'Past paper', icon: <FileText aria-hidden="true" /> },
};

const MINUTES = ['15', '30', '45', '60', '90'] as const;
const DAYS = ['3', '4', '5', '6', '7'] as const;

export default function ExamPlan() {
  useTitle('Exam plan');
  const profile = useProfile();
  const subjects = useStudentSubjects();
  const mastery = useSkillMastery();
  const activity = useActivity();
  const update = useUpdateProfile();
  const toast = useToast();

  const p = profile.data;
  const today = todayIn(p?.timezone ?? 'UTC');
  const planSubjects = useMemo<PlanSubject[]>(() => (subjects.data ?? []).map((s) => {
    const subj = getSubject(s.subject_key);
    const skills = (subj?.topics ?? []).flatMap((t) => skillsFor(s.subject_key, t.key).map((k) => `${s.subject_key}/${t.key}/${k.key}`));
    return { subjectKey: s.subject_key, examDate: s.exam_date, skills };
  }), [subjects.data]);

  const plan = useMemo(() => (p ? buildExamPlan({
    today, subjects: planSubjects, mastery: mastery.data ?? [],
    minutesPerDay: p.study_minutes_per_day ?? 30, daysPerWeek: p.study_days_per_week ?? 5,
  }) : null), [p, today, planSubjects, mastery.data]);

  const studiedToday = (activity.data ?? []).some((a) => a.day === today && (a.questions > 0 || a.reviews > 0));
  const loading = profile.isLoading || subjects.isLoading || mastery.isLoading;
  const error = profile.error ?? subjects.error ?? mastery.error;
  const hasExam = planSubjects.some((s) => s.examDate);

  const save = (patch: { study_minutes_per_day?: number; study_days_per_week?: number }) =>
    update.mutate(patch, { onError: (e) => toast.error(errorMessage(e)) });

  if (error) return <Page><ErrorState error={error} onRetry={() => { void profile.refetch(); void subjects.refetch(); void mastery.refetch(); }} /></Page>;

  const todayPlan = plan?.days[0];
  return (
    <Page>
      <PageHeader title="Exam plan" subtitle="A plan built from your exam dates and what you already know. It is rebuilt every day, so a missed day never piles up." />

      {loading || !plan ? (
        <div className="stack">{[0, 1, 2].map((i) => <Skeleton key={i} height={80} radius={14} />)}</div>
      ) : !planSubjects.length ? (
        <Card><EmptyState icon={<CalendarDays />} title="Add your subjects first" body="The plan is built from your subjects and exam dates." actions={<ButtonLink to="/settings/study">Add subjects</ButtonLink>} /></Card>
      ) : (
        <div className="layout-main-side">
          <div className="stack-lg">
            {!hasExam && (
              <Alert tone="info" icon={<Info />}>Add exam dates in <Link to="/settings/study" className="text-primary">study settings</Link> and the plan will prioritise the subjects that are coming up soonest.</Alert>
            )}

            <Card accent>
              <div className="row row--between row--wrap">
                <h2 className="card__title">Today, {formatDay(today, { weekday: 'long', day: 'numeric', month: 'short' })}</h2>
                {studiedToday && <Badge tone="success" icon={<CheckCircle2 />}>You have studied today</Badge>}
              </div>
              {todayPlan?.study && todayPlan.blocks.length ? (
                <ul className="plan-blocks mt-3">
                  {todayPlan.blocks.map((b, i) => <BlockRow key={i} b={b} action />)}
                </ul>
              ) : (
                <p className="text-sm text-2 mt-3 row-sm"><Moon size={16} aria-hidden="true" /> A rest day in your plan. Rest is part of learning; anything you do today is a bonus.</p>
              )}
            </Card>

            <Section title="Next two weeks" id="plan-days">
              <Card flush>
                <ul className="list list--padded">
                  {plan.days.slice(1).map((d) => (
                    <li key={d.date} className="list__item list__item--wrap plan-day">
                      <div className="plan-day__date">
                        <p className="fw-600 text-sm">{formatDay(d.date, { weekday: 'short' })}</p>
                        <p className="text-xs text-3">{formatDay(d.date, { day: 'numeric', month: 'short' })}</p>
                      </div>
                      {d.study && d.blocks.length ? (
                        <ul className="plan-chips">
                          {d.blocks.map((b, i) => <BlockRow key={i} b={b} />)}
                        </ul>
                      ) : <p className="text-sm text-3">Rest day</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            </Section>
          </div>

          <aside className="stack-lg" aria-label="Plan settings and outlook">
            <Card>
              <h2 className="card__title mb-3">Your study time</h2>
              <div className="stack">
                <Segmented label="Minutes per study day" value={String(p!.study_minutes_per_day) as (typeof MINUTES)[number]}
                  onChange={(v) => save({ study_minutes_per_day: Number(v) })}
                  options={MINUTES.map((m) => ({ value: m, label: `${m} min` }))} />
                <Segmented label="Study days per week" value={String(p!.study_days_per_week) as (typeof DAYS)[number]}
                  onChange={(v) => save({ study_days_per_week: Number(v) })}
                  options={DAYS.map((d) => ({ value: d, label: `${d} days` }))} />
                <p className="text-xs text-3">Changes apply straight away. Choose what you can keep up; a steady plan beats an ambitious one.</p>
              </div>
            </Card>

            <Card>
              <h2 className="card__title mb-3">Outlook</h2>
              <ul className="stack" style={{ listStyle: 'none' }}>
                {plan.outlook.map((o) => {
                  const s = getSubject(o.subjectKey);
                  const pct = o.total ? Math.round((o.secure / o.total) * 100) : 0;
                  return (
                    <li key={o.subjectKey} className="stack-sm">
                      <div className="row-sm">
                        <SubjectIcon subjectKey={o.subjectKey} size="sm" />
                        <span className="text-sm fw-500 grow truncate">{s ? subjectLabel(s) : o.subjectKey}</span>
                        {o.daysLeft != null && <span className="text-xs text-3 num">{o.daysLeft} days</span>}
                      </div>
                      <Meter value={pct} label={`${s ? subjectLabel(s) : o.subjectKey}: skills secure`} tone={pct >= 70 ? 'success' : 'primary'} />
                      <p className="text-xs text-3">{o.secure} of {o.total} skills secure (60%+ mastery)</p>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </aside>
        </div>
      )}
    </Page>
  );
}

function BlockRow({ b, action }: { b: PlanBlock; action?: boolean }) {
  const k = KIND[b.kind];
  const skill = skillById(b.skillId);
  const s = getSubject(b.subjectKey);
  const what = b.kind === 'review' ? `Skills due in ${s ? subjectLabel(s) : 'your subjects'}`
    : b.kind === 'paper' ? `${s ? subjectLabel(s) : ''}: ${b.minutes >= 60 ? 'past paper' : 'timed past-paper section'}` : skill?.name ?? '';
  if (!action) {
    return <li className="plan-chip" title={`${k.label}: ${what}`}>{k.icon}<span className="truncate">{what}</span></li>;
  }
  return (
    <li className="plan-block">
      <span className="plan-block__icon">{k.icon}</span>
      <div className="grow" style={{ minWidth: 0 }}>
        <p className="text-sm fw-500">{what}</p>
        <p className="text-xs text-3">{k.label} · {b.minutes} min{s && b.kind !== 'review' ? ` · ${subjectLabel(s)}` : ''}</p>
      </div>
      <ButtonLink to={blockLink(b)} size="sm" variant="secondary">Start</ButtonLink>
    </li>
  );
}
