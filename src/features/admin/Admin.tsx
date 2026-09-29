import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { Activity, AlertTriangle, Bot, ClipboardCheck, FileText, Flag, HeartPulse, LayoutDashboard, Link2, Plus } from 'lucide-react';
import { SUBJECTS, getSubject, subjectLabel } from '@/content/catalog';
import { difficultyLabel } from '@/content/engine';
import {
  useAdminOverview, useAdminQuestions, useAdminResources, useAiUsage, useAppEvents, useGenerationRuns, useIsAdmin,
  useOpenReports, useQuestionHealth, useResolveReport, useUpdateResource, type AdminQuestion, type QuestionFilter,
} from '@/data/admin';
import { Page, PageHeader, useTitle } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, PageLoader, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';
import { relativeTime } from '@/lib/dates';
import { QuestionEditor } from './QuestionEditor';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'review', label: 'Review queue', icon: ClipboardCheck },
  { id: 'questions', label: 'Questions', icon: FileText },
  { id: 'health', label: 'Quality', icon: HeartPulse },
  { id: 'reports', label: 'Reports', icon: Flag },
  { id: 'resources', label: 'Sources', icon: Link2 },
  { id: 'ai', label: 'AI usage', icon: Bot },
  { id: 'events', label: 'Errors', icon: Activity },
] as const;
type Tab = (typeof TABS)[number]['id'];

const FLAG_TEXT: Record<string, string> = {
  too_easy: 'Too easy for its level', too_hard: 'Very few get it right', difficulty_mismatch: 'Difficulty label looks wrong',
  suspicious_distractor: 'A wrong option is chosen more than the answer', slow: 'Takes unusually long', high_skip: 'Often skipped',
  reported: 'Reported by students', needs_review: 'Waiting for review',
};

export default function Admin() {
  useTitle('Content admin');
  const isAdmin = useIsAdmin();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.find((t) => t.id === sp.get('tab'))?.id ?? 'overview') as Tab;
  const [editing, setEditing] = useState<AdminQuestion | null | 'new'>(null);

  if (isAdmin.isLoading) return <Page><PageLoader /></Page>;
  if (isAdmin.error) return <Page><ErrorState error={isAdmin.error} onRetry={() => isAdmin.refetch()} /></Page>;
  if (!isAdmin.data) return <Navigate to="/home" replace />;

  return (
    <Page>
      <PageHeader title="Content admin" subtitle="Questions, provenance, quality signals and sources. Every change here is checked and logged on the server."
        actions={<Button icon={<Plus />} onClick={() => setEditing('new')}>New question</Button>} />
      <div className="tabs" role="tablist" aria-label="Admin sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="tab" onClick={() => setSp({ tab: t.id }, { replace: true })}>
            <t.icon aria-hidden="true" /> {t.label}
          </button>
        ))}
      </div>
      <div className="mt-4" role="tabpanel">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'review' && <QuestionsTab fixed={{ status: 'pending_review', subject: '', source: '', search: '' }} onEdit={setEditing} />}
        {tab === 'questions' && <QuestionsTab onEdit={setEditing} />}
        {tab === 'health' && <HealthTab />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'resources' && <ResourcesTab />}
        {tab === 'ai' && <AiTab />}
        {tab === 'events' && <EventsTab />}
      </div>
      {editing && <QuestionEditor question={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Page>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'warning' | 'danger' }) {
  return <Card tight><div className="stat"><span className="stat__label">{label}</span><span className={`stat__value${tone ? ` text-${tone}` : ''}`}>{value}</span></div></Card>;
}

function OverviewTab() {
  const o = useAdminOverview();
  const runs = useGenerationRuns();
  if (o.isLoading) return <Skeleton height={120} />;
  if (o.error) return <ErrorState error={o.error} onRetry={() => o.refetch()} />;
  const d = o.data!;
  return (
    <div className="stack-lg">
      <div className="grid-4">
        <Stat label="Published questions" value={d.questions_by_status.published ?? 0} />
        <Stat label="Waiting for review" value={d.questions_by_status.pending_review ?? 0} tone={(d.questions_by_status.pending_review ?? 0) > 0 ? 'warning' : undefined} />
        <Stat label="Open reports" value={d.open_reports} tone={d.open_reports > 0 ? 'warning' : undefined} />
        <Stat label="Errors (24 h)" value={d.errors_24h} tone={d.errors_24h > 0 ? 'danger' : undefined} />
      </div>
      <div className="grid-2">
        <Card>
          <h2 className="card__title mb-3">Published by source</h2>
          <ul className="stack-sm" style={{ listStyle: 'none' }}>
            {Object.entries(d.questions_by_source).map(([k, n]) => <li key={k} className="row row--between text-sm"><span>{k}</span><span className="num">{n}</span></li>)}
          </ul>
          <p className="text-xs text-3 mt-3">{d.skills_without_questions} skills have no published questions yet · {d.resources_unavailable} source links unavailable</p>
        </Card>
        <Card>
          <h2 className="card__title mb-3">Recent generation runs</h2>
          {runs.isLoading ? <Skeleton height={80} /> : runs.data?.length ? (
            <ul className="stack-sm" style={{ listStyle: 'none' }}>
              {runs.data.slice(0, 8).map((r) => (
                <li key={r.id} className="row row--between text-sm">
                  <span className="truncate">{r.subject_key} · {r.topic_key}</span>
                  <span className="text-xs num text-2">{r.published} ok · {r.pending_review} review · {r.rejected} rejected</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-3">No generation runs yet.</p>}
        </Card>
      </div>
    </div>
  );
}

function QuestionsTab({ fixed, onEdit }: { fixed?: QuestionFilter; onEdit: (q: AdminQuestion) => void }) {
  const [f, setF] = useState<QuestionFilter>(fixed ?? { status: '', subject: '', source: '', search: '' });
  const q = useAdminQuestions(fixed ?? f);
  return (
    <div className="stack">
      {!fixed && (
        <div className="filters">
          <Input type="search" aria-label="Search question text" placeholder="Search question text" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} />
          <Select aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as QuestionFilter['status'] })}>
            <option value="">Any status</option>
            {['draft', 'pending_review', 'published', 'archived', 'rejected'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </Select>
          <Select aria-label="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}>
            <option value="">Any subject</option>
            {SUBJECTS.map((s) => <option key={s.key} value={s.key}>{subjectLabel(s)} ({s.program.toUpperCase()})</option>)}
          </Select>
          <Select aria-label="Source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
            <option value="">Any source</option>
            {['owned', 'licensed', 'open_license', 'generated'].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
      )}
      <Card flush>
        {q.isLoading ? <div style={{ padding: 20 }}><Skeleton height={48} /></div> : q.error ? <ErrorState compact error={q.error} onRetry={() => q.refetch()} /> : q.data?.length ? (
          <ul className="list list--padded">
            {q.data.map((x) => (
              <li key={x.id}>
                <button type="button" className="list__item" onClick={() => onEdit(x)}>
                  <div className="list__main">
                    <p className="list__title">{x.question_type === 'procedural' ? `Procedural: ${x.template_key}` : x.stem}</p>
                    <p className="list__sub">{getSubject(x.subject_key) ? subjectLabel(getSubject(x.subject_key)!) : x.subject_key} · {x.topic_key} · {difficultyLabel(x.difficulty)} · {x.source_name} · v{x.version}</p>
                  </div>
                  <Badge tone={x.status === 'published' ? 'success' : x.status === 'pending_review' ? 'warning' : 'neutral'}>{x.status.replace('_', ' ')}</Badge>
                </button>
              </li>
            ))}
          </ul>
        ) : <EmptyState compact title={fixed ? 'Nothing waiting for review' : 'No questions match'} body={fixed ? 'Generated questions that fail a soft check land here.' : 'Try different filters.'} />}
      </Card>
      {q.data?.length === 100 && <p className="text-xs text-3">Showing the 100 most recently updated. Narrow the filters to see others.</p>}
    </div>
  );
}

function HealthTab() {
  const [min, setMin] = useState(30);
  const h = useQuestionHealth(min);
  return (
    <div className="stack">
      <div className="filters">
        <Select aria-label="Minimum attempts" value={min} onChange={(e) => setMin(Number(e.target.value))}>
          {[10, 30, 100].map((n) => <option key={n} value={n}>At least {n} attempts</option>)}
        </Select>
      </div>
      <Card flush>
        {h.isLoading ? <div style={{ padding: 20 }}><Skeleton height={48} /></div> : h.error ? <ErrorState compact error={h.error} onRetry={() => h.refetch()} /> : h.data?.length ? (
          <ul className="list list--padded">
            {h.data.map((r) => (
              <li key={r.question_id} className="list__item list__item--wrap">
                <AlertTriangle size={16} className="text-warning shrink-0" aria-hidden="true" />
                <div className="list__main">
                  <p className="list__title">{r.stem}</p>
                  <p className="list__sub">
                    {r.subject_key} · {difficultyLabel(r.difficulty)} · {r.attempts} attempts
                    {r.accuracy != null ? ` · ${Math.round(r.accuracy * 100)}% correct (expected about ${Math.round(r.expected_accuracy * 100)}%)` : ''}
                    {r.skip_rate != null ? ` · ${Math.round(r.skip_rate * 100)}% skipped` : ''}
                  </p>
                  <div className="row-sm row--wrap mt-1">{r.flags.map((f) => <Badge key={f} tone="warning">{FLAG_TEXT[f] ?? f}</Badge>)}</div>
                  {r.attempts > 0 && <p className="text-xs text-3 mt-1">Chosen: {r.option_counts.slice(0, 4).map((n, i) => `${'ABCD'[i]}${i === r.correct_index ? '✓' : ''} ${n}`).join(' · ')}</p>}
                </div>
              </li>
            ))}
          </ul>
        ) : <EmptyState compact title="No quality flags" body="Flags appear once questions have enough attempts to judge." />}
      </Card>
    </div>
  );
}

function ReportsTab() {
  const r = useOpenReports();
  const resolve = useResolveReport();
  const toast = useToast();
  return (
    <Card flush>
      {r.isLoading ? <div style={{ padding: 20 }}><Skeleton height={48} /></div> : r.error ? <ErrorState compact error={r.error} onRetry={() => r.refetch()} /> : r.data?.length ? (
        <ul className="list list--padded">
          {r.data.map((x) => (
            <li key={x.id} className="list__item list__item--wrap">
              <div className="list__main">
                <p className="list__title">{x.question?.stem ?? x.question_id}</p>
                <p className="list__sub">{x.reason.replace('_', ' ')}{x.comment ? `: “${x.comment}”` : ''} · {relativeTime(x.created_at)}</p>
              </div>
              <Button size="sm" variant="secondary" loading={resolve.isPending}
                onClick={() => resolve.mutate({ id: x.id, resolution: 'Reviewed' }, { onError: (e) => toast.error(errorMessage(e)) })}>Mark resolved</Button>
            </li>
          ))}
        </ul>
      ) : <EmptyState compact title="No open reports" body="Student reports about questions appear here." />}
    </Card>
  );
}

function ResourcesTab() {
  const r = useAdminResources();
  const update = useUpdateResource();
  const toast = useToast();
  return (
    <Card flush>
      {r.isLoading ? <div style={{ padding: 20 }}><Skeleton height={48} /></div> : r.error ? <ErrorState compact error={r.error} onRetry={() => r.refetch()} /> : r.data?.length ? (
        <ul className="list list--padded">
          {r.data.map((x) => (
            <li key={x.id} className="list__item list__item--wrap">
              <div className="list__main">
                <p className="list__title">{x.title}</p>
                <p className="list__sub">{x.provider} · {x.source_type} · {x.access}{x.license ? ` · ${x.license}` : ''}{x.last_checked_at ? ` · checked ${relativeTime(x.last_checked_at)}` : ' · not checked yet'}</p>
              </div>
              <Badge tone={x.status === 'active' ? 'success' : x.status === 'pending' ? 'warning' : 'danger'}>{x.status}</Badge>
              {x.status !== 'active' && (
                <Button size="sm" variant="secondary" loading={update.isPending}
                  onClick={() => update.mutate({ id: x.id, patch: { status: 'active' } }, { onError: (e) => toast.error(errorMessage(e)) })}>
                  {x.status === 'pending' ? 'Approve' : 'Mark working'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : <EmptyState compact title="No sources" body="Official links and hosted material appear here." />}
    </Card>
  );
}

function AiTab() {
  const [days, setDays] = useState(30);
  const u = useAiUsage(days);
  return (
    <div className="stack">
      <div className="filters">
        <Select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[1, 7, 30, 90].map((n) => <option key={n} value={n}>Last {n} day{n === 1 ? '' : 's'}</option>)}
        </Select>
      </div>
      {u.isLoading ? <Skeleton height={120} /> : u.error ? <ErrorState error={u.error} onRetry={() => u.refetch()} /> : (
        <>
          <div className="grid-4">
            <Stat label="Requests" value={u.data!.totals.requests} />
            <Stat label="Failures" value={u.data!.totals.failures} tone={u.data!.totals.failures ? 'warning' : undefined} />
            <Stat label="Estimated cost" value={`$${Number(u.data!.totals.estimated_cost_usd).toFixed(2)}`} />
            <Stat label="Average time" value={`${(u.data!.totals.avg_duration_ms / 1000).toFixed(1)}s`} />
          </div>
          <div className="grid-2">
            <Card>
              <h2 className="card__title mb-3">By model</h2>
              <table className="table"><thead><tr><th>Model</th><th>Requests</th><th>Failures</th><th>Cost</th></tr></thead>
                <tbody>{u.data!.by_model.map((m) => <tr key={m.model}><td>{m.model}</td><td className="num">{m.requests}</td><td className="num">{m.failures}</td><td className="num">${Number(m.estimated_cost_usd).toFixed(2)}</td></tr>)}</tbody>
              </table>
            </Card>
            <Card>
              <h2 className="card__title mb-3">By task</h2>
              <table className="table"><thead><tr><th>Task</th><th>Requests</th><th>Avg time</th><th>Cost</th></tr></thead>
                <tbody>{u.data!.by_task.map((t) => <tr key={t.task}><td>{t.task}</td><td className="num">{t.requests}</td><td className="num">{((t.avg_duration_ms ?? 0) / 1000).toFixed(1)}s</td><td className="num">${Number(t.estimated_cost_usd).toFixed(2)}</td></tr>)}</tbody>
              </table>
            </Card>
          </div>
          <p className="text-xs text-3">Costs are estimates from token counts and list prices; your Anthropic invoice is authoritative.</p>
        </>
      )}
    </div>
  );
}

function EventsTab() {
  const e = useAppEvents();
  return (
    <Card flush>
      {e.isLoading ? <div style={{ padding: 20 }}><Skeleton height={48} /></div> : e.error ? <ErrorState compact error={e.error} onRetry={() => e.refetch()} /> : e.data?.length ? (
        <ul className="list list--padded">
          {e.data.map((x) => (
            <li key={x.id} className="list__item">
              <Badge tone={x.level === 'error' ? 'danger' : x.level === 'warn' ? 'warning' : 'neutral'}>{x.level}</Badge>
              <div className="list__main">
                <p className="list__title">{x.event}{x.message ? `: ${x.message}` : ''}</p>
                <p className="list__sub">{x.source}{x.route ? ` · ${x.route}` : ''}{x.app_version ? ` · v${x.app_version}` : ''} · {relativeTime(x.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : <EmptyState compact title="No events" body="Client errors are logged here without personal data." />}
    </Card>
  );
}
