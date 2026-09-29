import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { ChevronDown, PenLine, Play, RotateCcw, Sparkles, Target, Wand2, Calendar } from 'lucide-react';
import { getSubject, subjectLabel } from '@/content/catalog';
import { WRITTEN_SUBJECTS } from '@/content/extras';
import { skillsFor } from '@/content/skills';
import { useStudentSubjects } from '@/data/profile';
import { useTopicStats } from '@/data/progress';
import { masteryMap, useMisconceptions, useSkillMastery } from '@/data/learning';
import { Page, PageHeader, Section, useTitle } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';
import { Badge, Segmented } from '@/components/ui/Badge';
import { ProgressRing } from '@/components/ui/Progress';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { Meter } from '@/components/charts';
import { SubjectIcon } from '@/components/SubjectIcon';
import { BAND_LABEL, masteryTone, summarizeSubject, weakTopics } from '@/lib/mastery';
import { daysBetween, formatDay, relativeTime, todayIn, browserTimeZone } from '@/lib/dates';
import type { SkillMasteryRow } from '@/lib/types';
import { GenerateQuestionsDialog } from './GenerateQuestionsDialog';

type Level = 'adaptive' | '2' | '3' | '4' | '5';

export default function SubjectPage() {
  const { subjectKey = '' } = useParams();
  const subject = getSubject(subjectKey);
  useTitle(subject ? subjectLabel(subject) : 'Subject');
  const stats = useTopicStats();
  const subjects = useStudentSubjects();
  const mastery = useSkillMastery();
  const misconceptions = useMisconceptions();
  const [level, setLevel] = useState<Level>('adaptive');
  const [length, setLength] = useState<'5' | '10' | '20'>('10');
  const [generateFor, setGenerateFor] = useState<string | null>(null);
  const [openTopic, setOpenTopic] = useState<string | null>(null);

  const summary = useMemo(() => summarizeSubject(subjectKey, stats.data ?? []), [subjectKey, stats.data]);
  const weakKeys = useMemo(() => new Set(weakTopics(stats.data ?? [], [subjectKey], 10).map((w) => w.topicKey)), [stats.data, subjectKey]);
  const bySkill = useMemo(() => masteryMap(mastery.data), [mastery.data]);
  const miscBySkill = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of misconceptions.data ?? []) {
      if (x.resolved_at || !x.misconception) continue;
      m.set(x.misconception.skill_id, (m.get(x.misconception.skill_id) ?? 0) + 1);
    }
    return m;
  }, [misconceptions.data]);
  const due = useMemo(() => [...bySkill.values()].filter((m) => m.skill_id.startsWith(`${subjectKey}/`) && m.next_review_at && Date.parse(m.next_review_at) <= Date.now()).length, [bySkill, subjectKey]);

  if (!subject) return <Navigate to="/study" replace />;
  const mine = subjects.data?.find((s) => s.subject_key === subjectKey);
  const today = todayIn(browserTimeZone());
  const examDays = mine?.exam_date ? daysBetween(today, mine.exam_date) : null;
  const levelParam = level === 'adaptive' ? '' : `&level=${level}`;

  return (
    <Page>
      <PageHeader
        back={{ to: '/study', label: 'Study' }}
        eyebrow={subject.program === 'igcse' ? `IGCSE${subject.code ? ` · ${subject.code}` : ''}` : 'Digital SAT'}
        title={<span className="row" style={{ gap: 14 }}><SubjectIcon subjectKey={subject.key} size="lg" />{subjectLabel(subject)}</span>}
        actions={<ButtonLink to={`/tutor?subject=${subject.key}`} variant="secondary" icon={<Sparkles />}>Ask the tutor</ButtonLink>}
      />

      <div className="grid-2">
        <Card className="row" style={{ gap: 20 }}>
          {stats.isLoading ? <Skeleton width={72} height={72} radius={36} /> : (
            <ProgressRing value={(summary?.mastery ?? 0) / 100} size={76} stroke={7} label={`Mastery ${summary?.mastery ?? 0}%`}>
              <span className="fw-600 num">{summary?.mastery ?? 0}%</span>
            </ProgressRing>
          )}
          <div className="grow">
            <p className="fw-600">Subject mastery</p>
            <p className="text-sm text-2 mt-1">
              {summary?.attempts
                ? `${summary.topicsStarted} of ${summary.topics.length} topics started · ${summary.accuracy}% correct over ${summary.attempts} answers`
                : 'Not started yet. Your first practice set will establish a baseline.'}
            </p>
            {examDays != null && examDays >= 0 && (
              <p className="text-sm mt-2 row-sm"><Calendar size={14} aria-hidden="true" /> Exam in <strong>{examDays} days</strong> ({formatDay(mine!.exam_date!, { day: 'numeric', month: 'short' })})</p>
            )}
            {due > 0 && (
              <p className="text-sm mt-2"><Link to={`/practice?mode=review&subject=${subject.key}`} className="text-primary row-sm"><RotateCcw size={14} aria-hidden="true" /> {due} skill{due === 1 ? '' : 's'} due for review</Link></p>
            )}
          </div>
        </Card>

        <Card className="stack">
          <div>
            <p className="fw-600">Practise the whole subject</p>
            <p className="text-sm text-2 mt-1">Adaptive sets focus on the skills you need most, at a level that stretches you.</p>
          </div>
          <div className="row row--wrap" style={{ gap: 10 }}>
            <Segmented label="Difficulty" value={level} onChange={setLevel}
              options={[{ value: 'adaptive', label: 'Adaptive' }, { value: '2', label: 'Developing' }, { value: '3', label: 'Standard' }, { value: '4', label: 'Challenging' }, { value: '5', label: 'Advanced' }]} />
            <Segmented label="Number of questions" value={length} onChange={setLength}
              options={[{ value: '5', label: '5' }, { value: '10', label: '10' }, { value: '20', label: '20' }]} />
          </div>
          <ButtonLink to={`/practice?subject=${subject.key}&mode=practice&count=${length}${levelParam}`} icon={<Play />} block>Start practice</ButtonLink>
        </Card>
      </div>

      {WRITTEN_SUBJECTS.has(subject.key) && (
        <div className="row row--wrap mt-4">
          <ButtonLink to={`/written?subject=${subject.key}`} variant="secondary" icon={<PenLine />}>Written answers</ButtonLink>
        </div>
      )}

      <Section title="Topics and skills" id="topics-h">
        <Card flush>
          {stats.isLoading || mastery.isLoading ? (
            <div className="stack" style={{ padding: 20 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={48} />)}</div>
          ) : stats.error || mastery.error ? (
            <ErrorState compact error={stats.error ?? mastery.error} onRetry={() => { void stats.refetch(); void mastery.refetch(); }} />
          ) : (
            <ul className="list list--padded">
              {summary!.topics.map((t) => {
                const skills = skillsFor(subject.key, t.topicKey);
                const expanded = openTopic === t.topicKey;
                const panelId = `skills-${t.topicKey}`;
                return (
                  <li key={t.topicKey} className="list__item topic-row topic-row--stack">
                    <div className="topic-row__head">
                      <div className="list__main">
                        <div className="row-sm row--wrap">
                          <p className="list__title" style={{ whiteSpace: 'normal' }}>{t.name}</p>
                          {weakKeys.has(t.topicKey) && <Badge tone="danger">Needs work</Badge>}
                        </div>
                        <div className="topic-row__meter">
                          <Meter value={t.mastery} label={`${t.name} mastery`} tone={masteryTone(t.mastery, t.attempts)} />
                          <span className="text-xs text-3 num">{t.attempts ? `${t.mastery}%` : ''}</span>
                        </div>
                        <p className="list__sub">
                          {t.attempts
                            ? `${BAND_LABEL[t.band]} · ${t.accuracy}% correct · ${t.attempts} answers${t.lastAttemptAt ? ` · ${relativeTime(t.lastAttemptAt)}` : ''}`
                            : 'Not started'}
                        </p>
                      </div>
                      <div className="topic-row__actions">
                        <ButtonLink to={`/practice?subject=${subject.key}&topic=${t.topicKey}&mode=practice&count=${length}${levelParam}`} size="sm">Practise</ButtonLink>
                        <button type="button" className="btn btn--ghost btn--sm btn--icon" aria-label={`Generate AI questions for ${t.name}`} title="Generate new questions with AI"
                          onClick={() => setGenerateFor(t.topicKey)}>
                          <Wand2 aria-hidden="true" />
                        </button>
                        <Link to={`/tutor?subject=${subject.key}&topic=${t.topicKey}`} className="btn btn--ghost btn--sm btn--icon" aria-label={`Ask the tutor about ${t.name}`} title="Ask the tutor">
                          <Sparkles aria-hidden="true" />
                        </Link>
                        {skills.length > 0 && (
                          <button type="button" className={`btn btn--ghost btn--sm btn--icon chevron${expanded ? ' is-open' : ''}`} aria-expanded={expanded} aria-controls={panelId}
                            aria-label={`${expanded ? 'Hide' : 'Show'} skills in ${t.name}`} onClick={() => setOpenTopic(expanded ? null : t.topicKey)}>
                            <ChevronDown aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                    {expanded && (
                      <ul className="skill-list" id={panelId}>
                        {skills.map((s) => {
                          const id = `${subject.key}/${t.topicKey}/${s.key}`;
                          return <SkillRow key={id} id={id} name={s.name} objective={s.objective} m={bySkill.get(id)} misconceptions={miscBySkill.get(id) ?? 0} />;
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </Section>

      {generateFor && (
        <GenerateQuestionsDialog subjectKey={subject.key} topicKey={generateFor} onClose={() => setGenerateFor(null)} />
      )}
    </Page>
  );
}

function SkillRow({ id, name, objective, m, misconceptions }: { id: string; name: string; objective: string; m: SkillMasteryRow | undefined; misconceptions: number }) {
  const value = m?.mastery ?? 0;
  const isDue = !!m?.next_review_at && Date.parse(m.next_review_at) <= Date.now();
  return (
    <li className="skill-row">
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row-sm row--wrap">
          <p className="text-sm fw-500">{name}</p>
          {isDue && <Badge tone="info">Review due</Badge>}
          {misconceptions > 0 && <Badge tone="warning">{misconceptions} recurring mistake{misconceptions === 1 ? '' : 's'}</Badge>}
        </div>
        <p className="text-xs text-3 mt-1">{objective}</p>
        <div className="topic-row__meter">
          <Meter value={value} label={`${name} mastery`} tone={masteryTone(value, m?.attempts ?? 0)} />
          <span className="text-xs text-3 num">{m?.attempts ? `${value}% · ${m.attempts} answers` : 'Not started'}</span>
        </div>
      </div>
      <ButtonLink to={`/practice?mode=guided&skill=${encodeURIComponent(id)}`} size="sm" variant="secondary" icon={<Target />} aria-label={`Guided practice: ${name}`}>Guided</ButtonLink>
    </li>
  );
}
