// Current streak as the student should see it. The database stores the
// streak as of the last study day; if that day is neither today nor
// yesterday (in the student's time zone), the streak has lapsed.
import { daysBetween, todayIn } from './dates';

export function currentStreak(
  p: { streak_days: number; last_study_date: string | null; timezone: string },
  now: Date = new Date(),
): number {
  if (!p.last_study_date || p.streak_days <= 0) return 0;
  const gap = daysBetween(p.last_study_date, todayIn(p.timezone, now));
  return gap <= 1 ? p.streak_days : 0;
}

/** True when today still needs work to keep the streak alive. */
export function streakAtRisk(p: { streak_days: number; last_study_date: string | null; timezone: string }, now: Date = new Date()): boolean {
  if (!p.last_study_date || p.streak_days <= 0) return false;
  return daysBetween(p.last_study_date, todayIn(p.timezone, now)) === 1;
}

/** Mirrors private.study_day_questions / study_day_reviews in the database. */
export const STUDY_DAY_QUESTIONS = 5;
export const STUDY_DAY_REVIEWS = 10;

export function dayCounts(a: { questions: number; reviews: number } | undefined): boolean {
  return !!a && (a.questions >= STUDY_DAY_QUESTIONS || a.reviews >= STUDY_DAY_REVIEWS);
}
