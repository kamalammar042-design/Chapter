import { useState } from 'react';
import { Brain, Plus, Trash2 } from 'lucide-react';
import { useProfile, useUpdateProfile } from '@/data/profile';
import { useAddMemory, useDeleteMemory, useMemory } from '@/data/social';
import { useAiAllowance } from '@/data/progress';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { ProgressBar } from '@/components/ui/Progress';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';
import { relativeTime } from '@/lib/dates';
import type { MemoryItem, TutorStyle } from '@/lib/types';

const STYLES: Array<{ id: TutorStyle; label: string; desc: string }> = [
  { id: 'balanced', label: 'Balanced', desc: 'Clear steps with brief reasoning' },
  { id: 'concise', label: 'Concise', desc: 'Short, direct answers' },
  { id: 'detailed', label: 'Detailed', desc: 'Thorough explanations and extra examples' },
  { id: 'socratic', label: 'Socratic', desc: 'Guides you with questions so you work it out' },
];

const KIND_LABEL: Record<MemoryItem['kind'], string> = {
  struggle: 'Finds hard', misconception: 'Misconception', strength: 'Strength', preference: 'Preference', goal: 'Goal', context: 'Context',
};

export function TutorSettings() {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const memory = useMemory();
  const del = useDeleteMemory();
  const add = useAddMemory();
  const allowance = useAiAllowance('tutor_message');
  const toast = useToast();
  const [clearOpen, setClearOpen] = useState(false);
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<MemoryItem['kind']>('preference');

  return (
    <div className="stack-lg">
      <Card>
        <CardHeader title="Explanation style" subtitle="How the tutor explains things by default." />
        <div className="stack-sm" role="radiogroup" aria-label="Explanation style">
          {STYLES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={profile?.tutor_style === s.id} className="choice"
              onClick={() => update.mutate({ tutor_style: s.id }, { onError: (e) => toast.error(errorMessage(e)) })}>
              <span className="grow"><span className="fw-600" style={{ display: 'block' }}>{s.label}</span><span className="text-sm text-2">{s.desc}</span></span>
              <span className="choice__check" aria-hidden="true" />
            </button>
          ))}
        </div>
      </Card>

      {allowance.data && allowance.data.cap > 0 && (
        <Card>
          <CardHeader title="Monthly allowance" subtitle={`${allowance.data.remaining} of ${allowance.data.cap} tutor messages left. Resets on the 1st.`} />
          <ProgressBar value={allowance.data.used} max={allowance.data.cap} label="Tutor messages used this month" />
        </Card>
      )}

      <Card>
        <CardHeader title="What the tutor remembers"
          subtitle="Short academic notes the tutor keeps so help fits you. It never stores anything beyond study. Delete anything you like."
          action={(memory.data?.length ?? 0) > 0 && <Button variant="ghost" size="sm" onClick={() => setClearOpen(true)}>Clear all</Button>} />
        {memory.isLoading ? <Skeleton height={80} /> : memory.error ? <ErrorState compact error={memory.error} onRetry={() => memory.refetch()} /> : memory.data?.length ? (
          <ul className="list">
            {memory.data.map((m) => (
              <li key={m.id} className="list__item">
                <div className="list__main">
                  <p className="text-sm">{m.content}</p>
                  <p className="list__sub row-sm"><Badge>{KIND_LABEL[m.kind]}</Badge> {m.source === 'user' ? 'Added by you' : `Learned ${relativeTime(m.updated_at)}`}</p>
                </div>
                <IconButton label="Forget this" icon={<Trash2 />} size="sm" onClick={() => del.mutate(m.id, { onError: (e) => toast.error(errorMessage(e)) })} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={<Brain />} title="Nothing remembered yet" body="As you work with the tutor, it notes things like topics you find tricky, so later explanations fit you better." />
        )}
        <form className="row row--wrap mt-4" onSubmit={(e) => {
          e.preventDefault();
          if (note.trim().length < 3) return;
          add.mutate({ kind, content: note.trim().slice(0, 300) }, {
            onSuccess: () => { setNote(''); toast.success('Added'); },
            onError: (err) => toast.error(errorMessage(err)),
          });
        }}>
          <Select aria-label="Type of note" value={kind} onChange={(e) => setKind(e.target.value as MemoryItem['kind'])} style={{ maxWidth: 170 }}>
            <option value="preference">Preference</option>
            <option value="goal">Goal</option>
            <option value="struggle">Finds hard</option>
            <option value="context">Context</option>
          </Select>
          <div className="grow" style={{ minWidth: 200 }}>
            <Field label={<span className="sr-only">Tell the tutor something about how you learn</span>}>
              <Input value={note} maxLength={300} placeholder='e.g. "I learn best from worked examples"' onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" variant="secondary" icon={<Plus />} loading={add.isPending} disabled={note.trim().length < 3}>Add</Button>
        </form>
      </Card>

      <Dialog open={clearOpen} onClose={() => setClearOpen(false)} title="Clear the tutor's memory?" description="The tutor will start learning about you from scratch. Your conversations are not deleted."
        footer={<>
          <Button variant="ghost" onClick={() => setClearOpen(false)}>Cancel</Button>
          <Button variant="danger" loading={del.isPending} onClick={() => del.mutate('all', { onSuccess: () => { setClearOpen(false); toast.success('Memory cleared'); }, onError: (e) => toast.error(errorMessage(e)) })}>Clear all</Button>
        </>} />
    </div>
  );
}
