import { useMemo } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Plus, RotateCcw, Shuffle } from 'lucide-react';
import { useStudentSubjects } from '@/data/profile';
import { useTopicStats } from '@/data/progress';
import { useDueReviews } from '@/data/learning';
import { Page, PageHeader, Section, useTitle } from '@/components/layout/Page';
import { ButtonLink } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { Meter } from '@/components/charts';
import { SubjectIcon } from '@/components/SubjectIcon';
import { subjectLabel } from '@/content/catalog';
import { BAND_LABEL, band, masteryTone, summarizeSubject } from '@/lib/mastery';

export default function Study() {
  useTitle('Study');
  const subjects = useStudentSubjects();
  const stats = useTopicStats();
  const due = useDueReviews();

  const summaries = useMemo(
    () => (subjects.data ?? []).map((s) => summarizeSubject(s.subject_key, stats.data ?? [])).filter((x) => !!x),
    [subjects.data, stats.data],
  );

  return (
    <Page>
      <PageHeader
        title="Study"
        subtitle="Pick a subject, or let Chapter mix questions from the topics you need most."
        actions={<ButtonLink to="/settings/study" variant="secondary" icon={<Plus />}>Edit subjects</ButtonLink>}
      />

      <div className="grid-2">
        <Link to="/practice?mode=daily&count=10" className="card card--interactive card--accent">
          <div className="row">
            <span className="state__icon" style={{ margin: 0 }} aria-hidden="true"><Shuffle /></span>
            <div className="grow">
              <p className="fw-600">Smart mix</p>
              <p className="text-sm text-2">10 questions across your subjects, weighted to the skills you need most</p>
            </div>
            <ArrowRight size={18} className="text-3" aria-hidden="true" />
          </div>
        </Link>
        <Link to="/practice?mode=review" className="card card--interactive">
          <div className="row">
            <span className="state__icon" style={{ margin: 0 }} aria-hidden="true"><RotateCcw /></span>
            <div className="grow">
              <p className="fw-600">Spaced review</p>
              <p className="text-sm text-2">
                {due.isLoading ? 'Checking…' : due.data?.length ? `${due.data.length} skill${due.data.length === 1 ? '' : 's'} due, with fresh questions` : 'Nothing due today'}
              </p>
            </div>
            <ArrowRight size={18} className="text-3" aria-hidden="true" />
          </div>
        </Link>
      </div>

      <Section title="Your subjects" id="subjects-h">
        {subjects.isLoading || stats.isLoading ? (
          <div className="grid-auto">{[0, 1, 2].map((i) => <Skeleton key={i} height={148} radius={14} />)}</div>
        ) : subjects.error || stats.error ? (
          <ErrorState error={subjects.error ?? stats.error} onRetry={() => { subjects.refetch(); stats.refetch(); }} />
        ) : (
          <div className="grid-auto">
            {summaries.map((s) => {
              const b = band(s.mastery, s.attempts);
              return (
                <Link key={s.subject.key} to={`/study/${s.subject.key}`} className="card card--interactive subject-card">
                  <div className="row">
                    <SubjectIcon subjectKey={s.subject.key} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <p className="fw-600 truncate">{subjectLabel(s.subject)}</p>
                      <p className="text-xs text-3">{s.subject.program === 'igcse' ? `IGCSE${s.subject.code ? ` · ${s.subject.code}` : ''}` : 'Digital SAT'} · {s.subject.topics.length} topics</p>
                    </div>
                  </div>
                  <div className="stack-sm mt-4">
                    <div className="row row--between text-sm">
                      <span className="text-2">{BAND_LABEL[b]}</span>
                      <span className="num fw-600">{s.mastery}%</span>
                    </div>
                    <Meter value={s.mastery} label={`${subjectLabel(s.subject)} mastery`} tone={masteryTone(s.mastery, s.attempts)} />
                    <p className="text-xs text-3">{s.topicsStarted} of {s.topics.length} topics started · {s.attempts} answers</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Section>
    </Page>
  );
}
