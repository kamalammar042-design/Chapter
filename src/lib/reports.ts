// ============================================================
// Weekly report
// ------------------------------------------------------------
// Turns recorded attempts into statements a student can act on. Every
// sentence is derived from counts in the data; when there is not enough
// data for a statement, the statement is omitted rather than softened
// into encouragement.
// ============================================================
import { getSubject, getTopic, subjectLabel } from '@/content/catalog';
import { addDays, daysBetween, todayIn, weekStart, type Day } from './dates';
import { weakTopics, summarizeSubject } from './mastery';
import type { DailyActivity, StudentSubject, TopicStat } from './types';

export interface AttemptLite {
  subject_key: string;
  topic_key: string;
  correct: boolean;
  created_at: string;
}

export interface PeriodTotals {
  questions: number;
  correct: number;
  accuracy: number | null;
  practiceMinutes: number;
  reviews: number;
  activeDays: number;
  xp: number;
}

export interface SubjectWeek {
  subjectKey: string;
  name: string;
  questions: number;
  correct: number;
  accuracy: number | null;
  weakestTopic: { topicKey: string; name: string; questions: number; missed: number } | null;
}

export interface Recommendation {
  id: string;
  title: string;
  reason: string;
  subjectKey?: string;
  topicKey?: string;
  kind: 'weak_topic' | 'exam_soon' | 'untouched' | 'consistency' | 'start';
}

export interface WeeklyReport {
  week: { start: Day; end: Day };
  totals: PeriodTotals;
  previous: PeriodTotals;
  subjects: SubjectWeek[];
  insights: string[];
  recommendations: Recommendation[];
}

function totals(activity: DailyActivity[], start: Day, end: Day): PeriodTotals {
  const rows = activity.filter((a) => a.day >= start && a.day <= end);
  const questions = rows.reduce((s, a) => s + a.questions, 0);
  const correct = rows.reduce((s, a) => s + a.correct, 0);
  return {
    questions,
    correct,
    accuracy: questions ? Math.round((correct / questions) * 100) : null,
    practiceMinutes: Math.round(rows.reduce((s, a) => s + a.practice_seconds, 0) / 60),
    reviews: rows.reduce((s, a) => s + a.reviews, 0),
    activeDays: rows.filter((a) => a.questions > 0 || a.reviews > 0).length,
    xp: rows.reduce((s, a) => s + a.xp, 0),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function buildWeeklyReport(input: {
  today: Day;
  timezone: string;
  activity: DailyActivity[];
  attempts: AttemptLite[];
  stats: TopicStat[];
  subjects: StudentSubject[];
  /** week to report on; defaults to the current week */
  weekOf?: Day;
}): WeeklyReport {
  const start = weekStart(input.weekOf ?? input.today);
  const end = addDays(start, 6);
  const prevStart = addDays(start, -7);
  const prevEnd = addDays(start, -1);
  const current = totals(input.activity, start, end);
  const previous = totals(input.activity, prevStart, prevEnd);

  // ---- per-subject breakdown for the week --------------------------
  const bySubject = new Map<string, { q: number; c: number; topics: Map<string, { q: number; wrong: number }> }>();
  for (const a of input.attempts) {
    const day = todayIn(input.timezone, new Date(a.created_at));
    if (day < start || day > end) continue;
    const s = bySubject.get(a.subject_key) ?? { q: 0, c: 0, topics: new Map() };
    s.q += 1;
    if (a.correct) s.c += 1;
    const t = s.topics.get(a.topic_key) ?? { q: 0, wrong: 0 };
    t.q += 1;
    if (!a.correct) t.wrong += 1;
    s.topics.set(a.topic_key, t);
    bySubject.set(a.subject_key, s);
  }

  const subjects: SubjectWeek[] = [...bySubject.entries()]
    .map(([key, s]) => {
      const subject = getSubject(key);
      let weakest: SubjectWeek['weakestTopic'] = null;
      for (const [tk, t] of s.topics) {
        if (t.wrong >= 2 && (!weakest || t.wrong > weakest.missed || (t.wrong === weakest.missed && t.q > weakest.questions))) {
          weakest = { topicKey: tk, name: getTopic(key, tk)?.name ?? tk, questions: t.q, missed: t.wrong };
        }
      }
      return {
        subjectKey: key,
        name: subject ? subjectLabel(subject) : key,
        questions: s.q,
        correct: s.c,
        accuracy: s.q ? Math.round((s.c / s.q) * 100) : null,
        weakestTopic: weakest,
      };
    })
    .sort((a, b) => b.questions - a.questions);

  // ---- insights ------------------------------------------------------
  const insights: string[] = [];
  if (current.questions === 0 && current.reviews === 0) {
    insights.push(start === weekStart(input.today) ? 'No practice recorded this week yet.' : 'No practice was recorded that week.');
  } else {
    const parts = [`You studied on ${plural(current.activeDays, 'day')} this week`];
    if (current.practiceMinutes > 0) parts.push(`for ${current.practiceMinutes} minutes of practice`);
    insights.push(`${parts.join(' ')}.`);
  }
  for (const s of subjects.slice(0, 3)) {
    if (s.questions < 5) continue;
    let line = `You answered ${plural(s.questions, `${s.name} question`)} (${s.accuracy}% correct)`;
    if (s.weakestTopic && s.weakestTopic.missed >= 3) {
      line += ` and missed ${s.weakestTopic.missed} of ${s.weakestTopic.questions} on ${s.weakestTopic.name}`;
    }
    insights.push(`${line}.`);
  }
  if (current.questions >= 10 && previous.questions >= 10 && current.accuracy != null && previous.accuracy != null) {
    const d = current.accuracy - previous.accuracy;
    if (Math.abs(d) >= 3) {
      insights.push(`Your accuracy is ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} points on last week (${previous.accuracy}% → ${current.accuracy}%).`);
    } else {
      insights.push(`Your accuracy held steady at about ${current.accuracy}%.`);
    }
  }
  if (previous.questions > 0 && current.questions > 0) {
    const d = current.questions - previous.questions;
    if (Math.abs(d) >= 10) insights.push(`That's ${Math.abs(d)} ${d > 0 ? 'more' : 'fewer'} questions than last week.`);
  }
  if (current.reviews > 0) insights.push(`You reviewed ${plural(current.reviews, 'flashcard')}.`);

  // ---- recommendations -----------------------------------------------
  const chosen = input.subjects.map((s) => s.subject_key);
  const recs: Recommendation[] = [];
  for (const w of weakTopics(input.stats, chosen.length ? chosen : undefined, 3)) {
    const subject = getSubject(w.subjectKey);
    recs.push({
      id: `weak:${w.subjectKey}:${w.topicKey}`,
      kind: 'weak_topic',
      title: `Practise ${w.name}`,
      reason: `${subject ? subjectLabel(subject) : ''}: ${w.accuracy}% correct over ${w.attempts} answers.`,
      subjectKey: w.subjectKey,
      topicKey: w.topicKey,
    });
  }
  for (const ss of input.subjects) {
    if (!ss.exam_date) continue;
    const days = daysBetween(input.today, ss.exam_date);
    if (days < 0 || days > 45) continue;
    const summary = summarizeSubject(ss.subject_key, input.stats);
    if (!summary) continue;
    const untouched = summary.topics.filter((t) => t.attempts === 0);
    if (untouched.length) {
      recs.push({
        id: `untouched:${ss.subject_key}`,
        kind: 'untouched',
        title: `Start ${untouched[0].name}`,
        reason: `Your ${subjectLabel(summary.subject)} exam is in ${plural(days, 'day')} and you haven't practised ${plural(untouched.length, 'topic')} yet.`,
        subjectKey: ss.subject_key,
        topicKey: untouched[0].topicKey,
      });
    } else if (summary.mastery < 60) {
      recs.push({
        id: `exam:${ss.subject_key}`,
        kind: 'exam_soon',
        title: `Focus on ${subjectLabel(summary.subject)}`,
        reason: `Exam in ${plural(days, 'day')}; mastery is ${summary.mastery}%.`,
        subjectKey: ss.subject_key,
      });
    }
  }
  if (!recs.length && current.questions === 0 && input.stats.length === 0) {
    recs.push({ id: 'start', kind: 'start', title: 'Take your first practice set', reason: 'Answer a few questions so Chapter can find your strengths and weak spots.' });
  } else if (current.activeDays > 0 && current.activeDays < 3 && start === weekStart(input.today)) {
    recs.push({ id: 'consistency', kind: 'consistency', title: 'Study little and often', reason: `Short sessions on more days beat one long session. You've studied on ${plural(current.activeDays, 'day')} so far this week.` });
  }

  return { week: { start, end }, totals: current, previous, subjects, insights, recommendations: dedupe(recs).slice(0, 5) };
}

function dedupe(recs: Recommendation[]): Recommendation[] {
  const seen = new Set<string>();
  return recs.filter((r) => {
    const k = `${r.subjectKey ?? ''}:${r.topicKey ?? ''}:${r.kind === 'consistency' || r.kind === 'start' ? r.kind : ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
