import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, Download, ExternalLink, FileText, Plus, Trash2, ClipboardList, Library } from 'lucide-react';
import { SUBJECTS, getSubject, subjectLabel } from '@/content/catalog';
import { useStudentSubjects } from '@/data/profile';
import { resourceUrl, useDeletePaperAttempt, usePaperAttempts, useResources } from '@/data/study';
import { Page, PageHeader, Section, useTitle } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Field';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { SubjectIcon } from '@/components/SubjectIcon';
import { errorMessage } from '@/lib/errors';
import { formatDay } from '@/lib/dates';
import type { Resource } from '@/lib/types';
import { LogPaperDialog } from './LogPaperDialog';
import { SESSION_LABEL, TYPE_LABEL, canLogScore, resourceAction, sourceBadge } from './paperMeta';

const subjectName = (key: string | null) => {
  const s = getSubject(key);
  return s ? (s.program === 'igcse' ? `IGCSE ${s.name}` : subjectLabel(s)) : 'General';
};

const FILTERS = ['program', 'subject', 'year', 'session', 'paper', 'type'] as const;
type FilterKey = (typeof FILTERS)[number];

export default function Papers() {
  useTitle('Past papers');
  const [sp, setSp] = useSearchParams();
  const resources = useResources();
  const attempts = usePaperAttempts();
  const mySubjects = useStudentSubjects();
  const del = useDeletePaperAttempt();
  const toast = useToast();
  const [logFor, setLogFor] = useState<Resource | null | 'blank'>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const f = Object.fromEntries(FILTERS.map((k) => [k, sp.get(k) ?? ''])) as Record<FilterKey, string>;
  const setFilter = (k: FilterKey, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v); else next.delete(k);
    if (k === 'program') next.delete('subject');
    setSp(next, { replace: true });
  };

  const mine = useMemo(() => new Set((mySubjects.data ?? []).map((s) => s.subject_key)), [mySubjects.data]);
  const subjectOptions = useMemo(() => [...SUBJECTS]
    .filter((s) => !f.program || s.program === f.program)
    .sort((a, b) => Number(mine.has(b.key)) - Number(mine.has(a.key))), [mine, f.program]);

  const all = resources.data ?? [];
  const years = [...new Set(all.map((r) => r.year).filter((y): y is number => y != null))].sort((a, b) => b - a);
  const paperNumbers = [...new Set(all.map((r) => r.paper_number).filter((n): n is number => n != null))].sort((a, b) => a - b);
  const filtered = all.filter((r) =>
    (!f.program || r.program === f.program)
    && (!f.subject || r.subject_key === f.subject)
    && (!f.year || String(r.year) === f.year)
    && (!f.session || r.session === f.session)
    && (!f.paper || String(r.paper_number) === f.paper)
    && (!f.type || r.resource_type === f.type));

  // the student's own subjects first, then the rest
  const groups = useMemo(() => {
    const m = new Map<string, Resource[]>();
    for (const r of filtered) {
      const k = r.subject_key ?? '';
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()].sort(([a], [b]) => Number(mine.has(b)) - Number(mine.has(a)) || a.localeCompare(b));
  }, [filtered, mine]);

  const open = async (r: Resource) => {
    setOpening(r.id);
    // open synchronously to avoid popup blockers, then point it at the file
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const url = await resourceUrl(r);
      if (win) win.location.href = url;
      else toast.error('Your browser blocked the new tab. Allow pop-ups for Chapter to open papers.');
    } catch (e) {
      win?.close();
      toast.error(errorMessage(e));
    } finally {
      setOpening(null);
    }
  };

  const done = attempts.data ?? [];
  const avg = done.length ? Math.round(done.reduce((s, a) => s + (Number(a.score) / Number(a.max_score)) * 100, 0) / done.length) : null;
  const anyFilter = FILTERS.some((k) => f[k]);

  return (
    <Page>
      <PageHeader
        title="Past papers"
        subtitle="Official papers and practice tests, where to find them, and a record of how you scored."
        actions={<Button icon={<Plus />} onClick={() => setLogFor('blank')}>Log a paper</Button>}
      />

      <div className="grid-4">
        <Card tight><div className="stat"><span className="stat__label">Papers logged</span><span className="stat__value">{attempts.isLoading ? '–' : done.length}</span></div></Card>
        <Card tight><div className="stat"><span className="stat__label">Average score</span><span className="stat__value">{avg == null ? '–' : `${avg}%`}</span></div></Card>
        <Card tight><div className="stat"><span className="stat__label">Best score</span><span className="stat__value">{done.length ? `${Math.max(...done.map((a) => Math.round((Number(a.score) / Number(a.max_score)) * 100)))}%` : '–'}</span></div></Card>
        <Card tight><div className="stat"><span className="stat__label">In directory</span><span className="stat__value">{resources.isLoading ? '–' : all.length}</span></div></Card>
      </div>

      <Section title="Library" id="library-h">
        <p className="text-sm text-2 mb-3">Publishers such as Cambridge and the College Board host their own papers. Chapter links to their official pages rather than copying the documents, and only hosts material it has the right to share.</p>
        <div className="filters">
          <Select aria-label="Curriculum" value={f.program} onChange={(e) => setFilter('program', e.target.value)}>
            <option value="">All curricula</option>
            <option value="igcse">Cambridge IGCSE</option>
            <option value="sat">SAT</option>
          </Select>
          <Select aria-label="Subject" value={f.subject} onChange={(e) => setFilter('subject', e.target.value)}>
            <option value="">All subjects</option>
            {subjectOptions.map((s) => <option key={s.key} value={s.key}>{subjectName(s.key)}</option>)}
          </Select>
          <Select aria-label="Year" value={f.year} onChange={(e) => setFilter('year', e.target.value)} disabled={!years.length}>
            <option value="">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Select aria-label="Session" value={f.session} onChange={(e) => setFilter('session', e.target.value)}>
            <option value="">All sessions</option>
            {Object.entries(SESSION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select aria-label="Paper" value={f.paper} onChange={(e) => setFilter('paper', e.target.value)} disabled={!paperNumbers.length}>
            <option value="">All papers</option>
            {paperNumbers.map((n) => <option key={n} value={n}>Paper {n}</option>)}
          </Select>
          <Select aria-label="Component" value={f.type} onChange={(e) => setFilter('type', e.target.value)}>
            <option value="">All components</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>

        {resources.isLoading ? (
          <div className="stack mt-4">{[0, 1, 2].map((i) => <Skeleton key={i} height={64} radius={14} />)}</div>
        ) : resources.error ? (
          <ErrorState error={resources.error} onRetry={() => resources.refetch()} />
        ) : groups.length ? (
          <div className="stack mt-4">
            {groups.map(([sk, items]) => (
              <Card key={sk || 'general'} flush>
                <div className="row" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                  <SubjectIcon subjectKey={sk || null} size="sm" />
                  <p className="fw-600 grow">{subjectName(sk || null)}</p>
                  <span className="text-xs text-3">{items.length} item{items.length === 1 ? '' : 's'}</span>
                </div>
                <ul className="list list--padded">
                  {items.map((r) => <ResourceRow key={r.id} r={r} opening={opening === r.id} onOpen={() => open(r)} onLog={() => setLogFor(r)} />)}
                </ul>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="mt-4">
            <EmptyState
              icon={<Library />}
              title={anyFilter ? 'Nothing matches these filters' : 'The directory is empty'}
              body={anyFilter ? 'Try a different curriculum, subject, year or component.' : 'Official sources will appear here once they are added. You can still log papers you sit elsewhere.'}
              actions={anyFilter ? <Button variant="secondary" size="sm" onClick={() => setSp(new URLSearchParams(), { replace: true })}>Clear filters</Button> : undefined}
            />
          </Card>
        )}
      </Section>

      <Section title="Your attempts" id="attempts-h">
        <Card flush>
          {attempts.isLoading ? <div style={{ padding: 20 }}><Skeleton height={48} /></div> : attempts.error ? (
            <ErrorState compact error={attempts.error} onRetry={() => attempts.refetch()} />
          ) : done.length ? (
            <ul className="list list--padded">
              {done.map((a) => {
                const pct = Math.round((Number(a.score) / Number(a.max_score)) * 100);
                return (
                  <li key={a.id} className="list__item">
                    <SubjectIcon subjectKey={a.subject_key} size="sm" />
                    <div className="list__main">
                      <p className="list__title">{a.title}</p>
                      <p className="list__sub">{formatDay(a.completed_on, { day: 'numeric', month: 'short', year: 'numeric' })}{a.duration_minutes ? ` · ${a.duration_minutes} min` : ''}{a.reflection ? ` · ${a.reflection}` : ''}</p>
                    </div>
                    <span className="text-right">
                      <span className="fw-600 num" style={{ display: 'block' }}>{pct}%</span>
                      <span className="text-xs text-3 num">{Number(a.score)}/{Number(a.max_score)}</span>
                    </span>
                    <IconButton label={`Delete ${a.title}`} icon={<Trash2 />} size="sm" onClick={() => setConfirmDelete(a.id)} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState compact icon={<ClipboardList />} title="No papers logged yet" body="After you sit a paper, log your mark to see your scores over time." actions={<Button size="sm" variant="secondary" onClick={() => setLogFor('blank')}>Log a paper</Button>} />
          )}
        </Card>
      </Section>

      {logFor && <LogPaperDialog paper={logFor === 'blank' ? null : logFor} defaultSubject={f.subject || (mySubjects.data?.[0]?.subject_key ?? '')} onClose={() => setLogFor(null)} />}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete this attempt?" description="Your goals and progress will be recalculated without it."
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button variant="danger" loading={del.isPending} onClick={() => confirmDelete && del.mutate(confirmDelete, { onSuccess: () => setConfirmDelete(null), onError: (e) => toast.error(errorMessage(e)) })}>Delete</Button>
        </>} />
    </Page>
  );
}

function ResourceRow({ r, opening, onOpen, onLog }: { r: Resource; opening: boolean; onOpen: () => void; onLog: () => void }) {
  const badge = sourceBadge(r);
  const unavailable = r.status === 'unavailable';
  const details = [
    r.session && r.year ? `${SESSION_LABEL[r.session]} ${r.year}` : r.year,
    r.paper_number && `Paper ${r.paper_number}${r.variant ? ` · variant ${r.variant}` : ''}`,
    r.component,
    r.tier && (r.tier === 'core' ? 'Core' : 'Extended'),
    r.duration_minutes && `${r.duration_minutes} min`,
    r.max_marks && `${r.max_marks} marks`,
    r.provider,
  ].filter(Boolean).join(' · ');
  const action = resourceAction(r);
  return (
    <li className="list__item list__item--wrap">
      <FileText size={18} className="text-3 shrink-0" aria-hidden="true" />
      <div className="list__main">
        <p className="list__title">{r.title}</p>
        <p className="list__sub">{details}</p>
        {unavailable && (
          <p className="text-xs text-warning mt-1 row-sm"><AlertTriangle size={12} aria-hidden="true" />
            This link stopped working{r.last_checked_at ? ` (checked ${formatDay(r.last_checked_at, { day: 'numeric', month: 'short' })})` : ''}. Try the publisher’s website.
          </p>
        )}
      </div>
      <div className="row-sm row--wrap">
        <Badge tone={badge.tone}>{badge.label}</Badge>
        <Badge outline>{TYPE_LABEL[r.resource_type]}</Badge>
      </div>
      <div className="row-sm">
        <Button size="sm" variant="secondary" icon={r.access === 'download' ? <Download /> : <ExternalLink />} loading={opening}
          disabled={unavailable} onClick={onOpen} aria-label={`${action}: ${r.title}${r.access === 'external' ? ' (opens in a new tab)' : ''}`}>
          {unavailable ? 'Unavailable' : action}
        </Button>
        {canLogScore(r) && <Button size="sm" variant="ghost" onClick={onLog} aria-label={`Log score for ${r.title}`}>Log score</Button>}
      </div>
    </li>
  );
}
