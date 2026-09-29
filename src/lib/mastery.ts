// ============================================================
// Mastery model
// ------------------------------------------------------------
// Numbers shown to students come from here, so the definitions are explicit:
//
// accuracy  correct / attempts over all time.
// recent    exponentially weighted accuracy maintained by the database
//           (each new answer counts 30%); reacts to improvement.
// evidence  how much we trust the estimate: min(1, attempts / 10).
// mastery   (0.6·recent + 0.4·accuracy) · evidence, as 0–100.
//           Three correct answers is not "mastered": evidence caps it at 30.
//
// Subject mastery averages every topic in the syllabus, counting topics not
// yet practised as 0, so it also reflects coverage. A student who has
// perfected one topic out of six is ~17% of the way through the subject.
// ============================================================
import { getSubject, type Subject } from '@/content/catalog';
import type { TopicStat } from './types';

export const EVIDENCE_TARGET = 10;
export const WEAK_MIN_ATTEMPTS = 3;

export type MasteryBand = 'not_started' | 'learning' | 'developing' | 'secure';

export function topicMastery(s: Pick<TopicStat, 'attempts' | 'correct' | 'recent_score'> | undefined): number {
  if (!s || s.attempts <= 0) return 0;
  const accuracy = s.correct / s.attempts;
  const recent = Math.min(1, Math.max(0, s.recent_score));
  const evidence = Math.min(1, s.attempts / EVIDENCE_TARGET);
  return Math.round((0.6 * recent + 0.4 * accuracy) * evidence * 100);
}

export function accuracy(correct: number, attempts: number): number | null {
  return attempts > 0 ? Math.round((correct / attempts) * 100) : null;
}

export function band(mastery: number, attempts: number): MasteryBand {
  if (attempts === 0) return 'not_started';
  if (mastery >= 75) return 'secure';
  if (mastery >= 45) return 'developing';
  return 'learning';
}

export const BAND_LABEL: Record<MasteryBand, string> = {
  not_started: 'Not started',
  learning: 'Learning',
  developing: 'Developing',
  secure: 'Secure',
};

export interface TopicSummary {
  subjectKey: string;
  topicKey: string;
  name: string;
  attempts: number;
  correct: number;
  accuracy: number | null;
  mastery: number;
  band: MasteryBand;
  lastAttemptAt: string | null;
}

export interface SubjectSummary {
  subject: Subject;
  attempts: number;
  correct: number;
  accuracy: number | null;
  mastery: number;
  topicsStarted: number;
  topics: TopicSummary[];
}

export function summarizeSubject(subjectKey: string, stats: TopicStat[]): SubjectSummary | null {
  const subject = getSubject(subjectKey);
  if (!subject) return null;
  const byTopic = new Map(stats.filter((s) => s.subject_key === subjectKey).map((s) => [s.topic_key, s]));
  const topics: TopicSummary[] = subject.topics.map((t) => {
    const s = byTopic.get(t.key);
    const m = topicMastery(s);
    return {
      subjectKey,
      topicKey: t.key,
      name: t.name,
      attempts: s?.attempts ?? 0,
      correct: s?.correct ?? 0,
      accuracy: s ? accuracy(s.correct, s.attempts) : null,
      mastery: m,
      band: band(m, s?.attempts ?? 0),
      lastAttemptAt: s?.last_attempt_at ?? null,
    };
  });
  const attempts = topics.reduce((a, t) => a + t.attempts, 0);
  const correct = topics.reduce((a, t) => a + t.correct, 0);
  return {
    subject,
    attempts,
    correct,
    accuracy: accuracy(correct, attempts),
    mastery: topics.length ? Math.round(topics.reduce((a, t) => a + t.mastery, 0) / topics.length) : 0,
    topicsStarted: topics.filter((t) => t.attempts > 0).length,
    topics,
  };
}

/**
 * Weak topics: enough evidence to be sure (≥3 answers) and recent or overall
 * accuracy below 60%. Weakest first; ties broken by more attempts (more
 * certain), then by most recent practice.
 */
export function weakTopics(stats: TopicStat[], subjectKeys?: string[], limit = 5): TopicSummary[] {
  const allowed = subjectKeys ? new Set(subjectKeys) : null;
  const out: Array<TopicSummary & { score: number }> = [];
  for (const s of stats) {
    if (allowed && !allowed.has(s.subject_key)) continue;
    if (s.attempts < WEAK_MIN_ATTEMPTS) continue;
    const acc = s.correct / s.attempts;
    if (acc >= 0.6 && s.recent_score >= 0.6) continue;
    const subject = getSubject(s.subject_key);
    const topic = subject?.topics.find((t) => t.key === s.topic_key);
    if (!topic) continue;
    const m = topicMastery(s);
    out.push({
      subjectKey: s.subject_key,
      topicKey: s.topic_key,
      name: topic.name,
      attempts: s.attempts,
      correct: s.correct,
      accuracy: accuracy(s.correct, s.attempts),
      mastery: m,
      band: band(m, s.attempts),
      lastAttemptAt: s.last_attempt_at,
      score: Math.min(acc, s.recent_score),
    });
  }
  out.sort((a, b) => a.score - b.score || b.attempts - a.attempts || String(b.lastAttemptAt).localeCompare(String(a.lastAttemptAt)));
  return out.slice(0, limit).map(({ score: _score, ...t }) => t);
}

/**
 * Colour for a mastery value. Low mastery with little evidence is not a
 * failure, so "learning" is the accent colour; red is reserved for topics
 * that weakTopics() flags from real wrong answers.
 */
export function masteryTone(m: number, attempts: number): 'neutral' | 'primary' | 'warning' | 'success' {
  const b = band(m, attempts);
  if (b === 'not_started') return 'neutral';
  if (b === 'secure') return 'success';
  if (b === 'developing') return 'warning';
  return 'primary';
}

/**
 * Direction of a skill from recent answers against its overall accuracy.
 * recent_score is an exponential average of the latest answers (server-side).
 */
export function skillTrend(m: { attempts: number; correct: number; recent_score: number }): 'improving' | 'slipping' | 'steady' {
  if (m.attempts < 4) return 'steady';
  const overall = m.correct / m.attempts;
  if (m.recent_score >= overall + 0.12) return 'improving';
  if (m.recent_score <= overall - 0.12) return 'slipping';
  return 'steady';
}
