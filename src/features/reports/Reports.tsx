import { useMemo, useState } from 'react';
import { ArrowRight, ArrowDownRight, ArrowUpRight, Lightbulb, BookOpen, Minus } from 'lucide-react';
import { useProfile, useStudentSubjects } from '@/data/profile';
import { useActivity, useRecentAttempts, useTopicStats } from '@/data/progress';
import { Page, PageHeader, Section, useTitle } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { ColumnChart } from '@/components/charts';
import { SubjectIcon } from '@/components/SubjectIcon';
import { buildWeeklyReport, type PeriodTotals } from '@/lib/reports';
import { addDays, dayRange, formatDay, todayIn, weekdayShort } from '@/lib/dates';

type Which = 'this' | 'last';

function Delta({ now, before, unit = '', higherIsBetter = true }: { now: number | null; before: number | null; unit?: string; higherIsBetter?: boolean }) {
  if (now == null || before == null || (before === 0 && now === 0)) return null;
  const d = now - before;
  if (d === 0) return <span className="delta text-3"><Minus size={12} aria-hidden="true" /> same as week before</span>;
  const good = higherIsBetter ? d > 0 : d < 0;
  return (
    <span className={`delta ${good ? 'text-success' : 'text-warning'}`}>
      {d > 0 ? <ArrowUpRight size={12} aria-hidden="true" /> : <ArrowDownRight size={12} aria-hidden="true" />}
      {d > 0 ? '+' : ''}{d}{unit} vs week before
    </span>
  );
}

function StatTiles({ t, p }: { t: PeriodTotals; p: PeriodTotals }) {
  return (
    <div className="grid-4">
      <Card tight><div className="stat"><span className="stat__label">Questions</span><span className="stat__value">{t.questions}</span><Delta now={t.questions} before={p.questions} /></div></Card>
      <Card tight><div className="stat"><span className="stat__label">Accuracy</span><span className="stat__value">{t.accuracy == null ? '–' : `${t.accuracy}%`}</span><Delta now={t.accuracy} before={p.accuracy} unit=" pts" /></div></Card>
      <Card tight><div className="stat"><span className="stat__label">Practice time</span><span className="stat__value">{t.practiceMinutes}<small>min</small></span><Delta now={t.practiceMinutes} before={p.practiceMinutes} unit=" min" /></div></Card>
      <Card tight><div className="stat"><span className="stat__label">Days studied</span><span className="stat__value">{t.activeDays}<small>/ 7</small></span><Delta now={t.activeDays} before={p.activeDays} /></div></Card>
    </div>
  );
}

export default function Reports() {
  useTitle('Reports');
  const profile = useProfile();
  const subjects = useStudentSubjects();
  const stats = useTopicStats();
  const activity = useActivity();
  const attempts = useRecentAttempts();
  const [which, setWhich] = useState<Which>('this');

  const tz = profile.data?.timezone ?? 'UTC';
  const today = todayIn(tz);
  const report = useMemo(() => {
    if (!activity.data || !attempts.data || !stats.data || !subjects.data) return null;
    return buildWeeklyReport({
      today, timezone: tz, activity: activity.data, attempts: attempts.data, stats: stats.data, subjects: subjects.data,
      weekOf: which === 'this' ? today : addDays(today, -7),
    });
  }, [activity.data, attempts.data, stats.data, subjects.data, today, tz, which]);

  const days = useMemo(() => {
    if (!report) return [];
    return dayRange(report.week.start, report.week.end).map((d) => {
      const a = activity.data?.find((x) => x.day === d);
      return {
        key: d, label: weekdayShort(d).slice(0, 2), title: formatDay(d, { weekday: 'long', day: 'numeric', month: 'short' }),
        value: a?.questions ?? 0, detail: a?.reviews ? `${a.reviews} flashcard reviews` : undefined, highlight: d === today,
      };
    });
  }, [report, activity.data, today]);

  const error = activity.error || attempts.error || stats.error || subjects.error;

  return (
    <Page>
      <PageHeader title="Weekly report"
        subtitle={report ? `${formatDay(report.week.start, { day: 'numeric', month: 'long' })} – ${formatDay(report.week.end, { day: 'numeric', month: 'long' })}` : 'Your week, in numbers'}
        actions={<Segmented label="Week" value={which} onChange={setWhich} options={[{ value: 'this', label: 'This week' }, { value: 'last', label: 'Last week' }]} />} />

      {error ? <ErrorState error={error} onRetry={() => { activity.refetch(); attempts.refetch(); stats.refetch(); }} /> : !report ? (
        <div className="stack"><Skeleton height={90} /><Skeleton height={200} /></div>
      ) : (
        <>
          <StatTiles t={report.totals} p={report.previous} />

          <div className="layout-main-side mt-6">
            <div className="stack-lg">
              <Card>
                <h2 className="card__title row-sm"><BookOpen size={16} aria-hidden="true" /> Summary</h2>
                <ul className="insights mt-3">
                  {report.insights.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </Card>

              <Card>
                <h2 className="card__title">Questions per day</h2>
                <div className="mt-4"><ColumnChart data={days} unit="questions" caption="Questions answered per day this week" height={140} /></div>
              </Card>

              <Section title="By subject" id="subj-h">
                <Card flush>
                  {report.subjects.length ? (
                    <table className="table">
                      <thead><tr><th scope="col">Subject</th><th scope="col" className="num">Questions</th><th scope="col" className="num">Correct</th><th scope="col">Most missed topic</th></tr></thead>
                      <tbody>
                        {report.subjects.map((s) => (
                          <tr key={s.subjectKey}>
                            <th scope="row"><span className="row-sm"><SubjectIcon subjectKey={s.subjectKey} size="sm" /> {s.name}</span></th>
                            <td className="num">{s.questions}</td>
                            <td className="num">{s.accuracy}%</td>
                            <td>{s.weakestTopic ? `${s.weakestTopic.name} (${s.weakestTopic.missed} missed)` : <span className="text-3">–</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <EmptyState compact title="No questions answered this week" />}
                </Card>
              </Section>
            </div>

            <aside>
              <Card>
                <h2 className="card__title row-sm"><Lightbulb size={16} aria-hidden="true" /> What to do next</h2>
                {report.recommendations.length ? (
                  <ul className="stack mt-3" style={{ listStyle: 'none' }}>
                    {report.recommendations.map((r) => (
                      <li key={r.id} className="rec">
                        <p className="fw-600 text-sm">{r.title}</p>
                        <p className="text-sm text-2 mt-1">{r.reason}</p>
                        {r.subjectKey && (
                          <ButtonLink size="sm" variant="secondary" className="mt-2" iconRight={<ArrowRight />}
                            to={`/practice?subject=${r.subjectKey}${r.topicKey ? `&topic=${r.topicKey}` : ''}&mode=${r.kind === 'weak_topic' ? 'weakness' : 'practice'}`}>
                            Practise
                          </ButtonLink>
                        )}
                        {r.kind === 'start' && <ButtonLink size="sm" className="mt-2" to="/practice?mode=daily&count=10">Start</ButtonLink>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-2 mt-3">No recommendations right now. Keep your routine going.</p>}
              </Card>
            </aside>
          </div>
        </>
      )}
    </Page>
  );
}
