// ============================================================
// Goal progress, computed from recorded activity only.
// Weekly goals cover Monday–Sunday in the student's time zone. Dated goals
// run from the day they were created to their due date.
// ============================================================
import { addDays, daysBetween, weekStart, type Day } from './dates';
import type { DailyActivity, Goal, GoalKind, PaperAttempt } from './types';

export type GoalStatus = 'met' | 'on_track' | 'behind' | 'not_enough_data' | 'ended';

export interface GoalProgress {
  current: number;
  target: number;
  /** 0..1 */
  fraction: number;
  status: GoalStatus;
  valueLabel: string;
  window: { start: Day; end: Day };
  daysLeft: number;
}

export const GOAL_META: Record<GoalKind, { label: string; unit: string; subjectScoped: boolean; min: number; max: number; step: number }> = {
  questions: { label: 'Answer questions', unit: 'questions', subjectScoped: false, min: 5, max: 2000, step: 5 },
  practice_minutes: { label: 'Practice time', unit: 'minutes', subjectScoped: false, min: 10, max: 3000, step: 10 },
  accuracy: { label: 'Accuracy', unit: '%', subjectScoped: false, min: 40, max: 100, step: 5 },
  flashcards: { label: 'Review flashcards', unit: 'reviews', subjectScoped: false, min: 10, max: 5000, step: 10 },
  papers: { label: 'Complete past papers', unit: 'papers', subjectScoped: true, min: 1, max: 100, step: 1 },
  paper_score: { label: 'Past-paper score', unit: '%', subjectScoped: true, min: 30, max: 100, step: 1 },
  sat_score: { label: 'SAT practice-test score', unit: 'points', subjectScoped: false, min: 400, max: 1600, step: 10 },
};

/** Minimum answered questions before an accuracy goal is judged. */
export const ACCURACY_MIN_QUESTIONS = 20;

export function goalWindow(goal: Pick<Goal, 'period' | 'created_at' | 'due_date'>, today: Day): { start: Day; end: Day } {
  if (goal.period === 'weekly') {
    const start = weekStart(today);
    return { start, end: addDays(start, 6) };
  }
  return { start: goal.created_at.slice(0, 10), end: (goal.due_date ?? today).slice(0, 10) };
}

export function goalProgress(
  goal: Goal,
  data: { activity: DailyActivity[]; papers: PaperAttempt[]; today: Day },
): GoalProgress {
  const { today } = data;
  const window = goalWindow(goal, today);
  const inWindow = (d: string) => d >= window.start && d <= window.end;
  const days = data.activity.filter((a) => inWindow(a.day));
  const sum = (f: (a: DailyActivity) => number) => days.reduce((acc, a) => acc + f(a), 0);
  const papers = data.papers
    .filter((p) => inWindow(p.completed_on) && (!goal.subject_key || p.subject_key === goal.subject_key))
    .sort((a, b) => b.completed_on.localeCompare(a.completed_on) || b.created_at.localeCompare(a.created_at));

  const target = Number(goal.target);
  let current = 0;
  let valueLabel = '';
  let judged = true;
  let cumulative = true; // cumulative goals can be "behind" relative to time elapsed

  switch (goal.kind) {
    case 'questions':
      current = sum((a) => a.questions);
      valueLabel = `${current} / ${target} questions`;
      break;
    case 'practice_minutes':
      current = Math.round(sum((a) => a.practice_seconds) / 60);
      valueLabel = `${current} / ${target} min`;
      break;
    case 'flashcards':
      current = sum((a) => a.reviews);
      valueLabel = `${current} / ${target} reviews`;
      break;
    case 'papers':
      current = papers.length;
      valueLabel = `${current} / ${target} papers`;
      break;
    case 'accuracy': {
      cumulative = false;
      const q = sum((a) => a.questions);
      const c = sum((a) => a.correct);
      current = q ? Math.round((c / q) * 100) : 0;
      judged = q >= ACCURACY_MIN_QUESTIONS;
      valueLabel = q ? `${current}% over ${q} questions` : 'No questions yet';
      break;
    }
    case 'paper_score': {
      cumulative = false;
      const latest = papers[0];
      current = latest ? Math.round((Number(latest.score) / Number(latest.max_score)) * 100) : 0;
      judged = !!latest;
      valueLabel = latest ? `Latest ${current}% · target ${target}%` : 'No papers logged yet';
      break;
    }
    case 'sat_score': {
      cumulative = false;
      const latest = papers.find((p) => Number(p.max_score) === 1600);
      current = latest ? Number(latest.score) : 0;
      judged = !!latest;
      valueLabel = latest ? `Latest ${current} · target ${target}` : 'No practice tests logged yet';
      break;
    }
  }

  const fraction = target > 0 ? Math.min(1, Math.max(0, current / target)) : 0;
  const totalDays = Math.max(1, daysBetween(window.start, window.end) + 1);
  const elapsed = Math.min(totalDays, Math.max(0, daysBetween(window.start, today) + 1));
  const daysLeft = Math.max(0, daysBetween(today, window.end));
  const ended = today > window.end;

  let status: GoalStatus;
  if (current >= target && judged) status = 'met';
  else if (!judged) status = ended ? 'ended' : 'not_enough_data';
  else if (ended) status = 'ended';
  else if (cumulative) status = fraction + 1e-9 >= elapsed / totalDays - 0.15 ? 'on_track' : 'behind';
  else status = 'behind';

  return { current, target, fraction, status, valueLabel, window, daysLeft };
}

export const STATUS_LABEL: Record<GoalStatus, string> = {
  met: 'Achieved',
  on_track: 'On track',
  behind: 'Behind',
  not_enough_data: 'Not enough data yet',
  ended: 'Ended',
};
