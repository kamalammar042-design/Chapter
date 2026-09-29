import { getSubject, subjectLabel } from '@/content/catalog';
import type { Goal } from '@/lib/types';
import { formatDay } from '@/lib/dates';

/** Human title for a goal, e.g. "Answer 100 questions this week". */
export function GOAL_TITLE(g: Pick<Goal, 'kind' | 'target' | 'period' | 'subject_key' | 'target_label' | 'due_date'>): string {
  const t = Number(g.target);
  const when = g.period === 'weekly' ? ' this week' : g.due_date ? ` by ${formatDay(g.due_date, { day: 'numeric', month: 'short' })}` : '';
  const subj = g.subject_key ? getSubject(g.subject_key) : undefined;
  const sName = subj ? subjectLabel(subj) : '';
  switch (g.kind) {
    case 'questions': return `Answer ${t} questions${when}`;
    case 'practice_minutes': return `Practise for ${t} minutes${when}`;
    case 'accuracy': return `Reach ${t}% accuracy${when}`;
    case 'flashcards': return `Review ${t} flashcards${when}`;
    case 'papers': return `Complete ${t} ${sName ? `${sName} ` : ''}past paper${t === 1 ? '' : 's'}${when}`;
    case 'paper_score': return `Score ${t}%${g.target_label ? ` (${g.target_label})` : ''} on ${sName || 'a past paper'}${when}`;
    case 'sat_score': return `Score ${t} on an SAT practice test${when}`;
  }
}
