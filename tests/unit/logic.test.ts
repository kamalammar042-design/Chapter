import { describe, expect, it } from 'vitest';
import { topicMastery, band, weakTopics, summarizeSubject, accuracy } from '@/lib/mastery';
import { currentStreak, streakAtRisk } from '@/lib/streak';
import { addDays, daysBetween, formatMinutes, todayIn, weekStart, dayRange } from '@/lib/dates';
import { goalProgress } from '@/lib/goals';
import { buildWeeklyReport } from '@/lib/reports';
import { leagueFor, xpFor } from '@/lib/league';
import { evaluateAchievements } from '@/lib/achievements';
import type { DailyActivity, Goal, PaperAttempt, TopicStat } from '@/lib/types';

const stat = (o: Partial<TopicStat>): TopicStat => ({
  subject_key: 'igcse.physics', topic_key: 'electricity', attempts: 0, correct: 0, recent_score: 0, last_attempt_at: null, ...o,
});

describe('mastery', () => {
  it('is 0 with no attempts', () => {
    expect(topicMastery(undefined)).toBe(0);
    expect(topicMastery(stat({}))).toBe(0);
  });

  it('does not call three correct answers mastered', () => {
    const m = topicMastery(stat({ attempts: 3, correct: 3, recent_score: 1 }));
    expect(m).toBe(30);
    expect(band(m, 3)).toBe('learning');
  });

  it('reaches 100 only with enough evidence and perfect accuracy', () => {
    expect(topicMastery(stat({ attempts: 10, correct: 10, recent_score: 1 }))).toBe(100);
    expect(topicMastery(stat({ attempts: 40, correct: 30, recent_score: 0.9 }))).toBe(84);
  });

  it('weights recent performance', () => {
    const improving = topicMastery(stat({ attempts: 20, correct: 10, recent_score: 0.95 }));
    const declining = topicMastery(stat({ attempts: 20, correct: 10, recent_score: 0.2 }));
    expect(improving).toBeGreaterThan(declining);
  });

  it('computes accuracy, returning null without data', () => {
    expect(accuracy(0, 0)).toBeNull();
    expect(accuracy(7, 9)).toBe(78);
  });

  it('flags weak topics only with evidence, weakest first', () => {
    const stats = [
      stat({ topic_key: 'waves', attempts: 2, correct: 0, recent_score: 0 }), // too few answers
      stat({ topic_key: 'electricity', attempts: 10, correct: 4, recent_score: 0.4 }),
      stat({ topic_key: 'thermal', attempts: 8, correct: 2, recent_score: 0.2 }),
      stat({ topic_key: 'magnetism', attempts: 12, correct: 11, recent_score: 0.9 }), // strong
    ];
    const weak = weakTopics(stats);
    expect(weak.map((w) => w.topicKey)).toEqual(['thermal', 'electricity']);
    expect(weak[0]).toMatchObject({ accuracy: 25, attempts: 8, name: 'Thermal physics' });
  });

  it('flags a topic whose recent score collapsed even if overall accuracy is fine', () => {
    const weak = weakTopics([stat({ attempts: 30, correct: 24, recent_score: 0.3 })]);
    expect(weak).toHaveLength(1);
  });

  it('ignores stats for topics no longer in the catalogue', () => {
    expect(weakTopics([stat({ topic_key: 'astrology', attempts: 9, correct: 0 })])).toEqual([]);
  });

  it('averages subject mastery over every syllabus topic', () => {
    const s = summarizeSubject('igcse.physics', [stat({ topic_key: 'electricity', attempts: 10, correct: 10, recent_score: 1 })]);
    expect(s?.topics).toHaveLength(6);
    expect(s?.mastery).toBe(17); // 100 / 6 topics
    expect(s?.topicsStarted).toBe(1);
    expect(s?.accuracy).toBe(100);
  });
});

describe('dates', () => {
  it('computes today in a time zone', () => {
    const t = new Date('2026-03-01T22:30:00Z');
    expect(todayIn('UTC', t)).toBe('2026-03-01');
    expect(todayIn('Asia/Dubai', t)).toBe('2026-03-02');
    expect(todayIn('America/New_York', t)).toBe('2026-03-01');
    expect(todayIn('Not/AZone', t)).toBe('2026-03-01');
  });

  it('does calendar arithmetic across month ends', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(daysBetween('2026-01-30', '2026-03-02')).toBe(31);
    expect(dayRange('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });

  it('starts weeks on Monday', () => {
    expect(weekStart('2026-09-27')).toBe('2026-09-21'); // Sunday
    expect(weekStart('2026-09-21')).toBe('2026-09-21'); // Monday
    expect(weekStart('2026-09-23')).toBe('2026-09-21');
  });
});

describe('streaks', () => {
  const now = new Date('2026-05-10T12:00:00Z');
  it('shows the stored streak when the last study day was today or yesterday', () => {
    expect(currentStreak({ streak_days: 5, last_study_date: '2026-05-10', timezone: 'UTC' }, now)).toBe(5);
    expect(currentStreak({ streak_days: 5, last_study_date: '2026-05-09', timezone: 'UTC' }, now)).toBe(5);
    expect(streakAtRisk({ streak_days: 5, last_study_date: '2026-05-09', timezone: 'UTC' }, now)).toBe(true);
  });

  it('shows 0 once a day has been missed', () => {
    expect(currentStreak({ streak_days: 12, last_study_date: '2026-05-08', timezone: 'UTC' }, now)).toBe(0);
    expect(currentStreak({ streak_days: 0, last_study_date: null, timezone: 'UTC' }, now)).toBe(0);
  });

  it('uses the student time zone for "today"', () => {
    const late = new Date('2026-05-10T21:00:00Z'); // already the 11th in Dubai
    expect(currentStreak({ streak_days: 3, last_study_date: '2026-05-09', timezone: 'Asia/Dubai' }, late)).toBe(0);
  });
});

describe('league and XP', () => {
  it('mirrors the server XP rules', () => {
    expect(xpFor('easy', true)).toBe(10);
    expect(xpFor('medium', true)).toBe(20);
    expect(xpFor('hard', true)).toBe(35);
    expect(xpFor('hard', false)).toBe(0);
  });

  it('places XP on the ladder with progress to the next league', () => {
    expect(leagueFor(0).current.name).toBe('Bronze');
    const l = leagueFor(1750);
    expect(l.current.name).toBe('Silver');
    expect(l.next?.name).toBe('Gold');
    expect(l.progress).toBeCloseTo(0.5);
    expect(l.toNext).toBe(750);
    expect(leagueFor(1_000_000).next).toBeNull();
  });
});

const goal = (o: Partial<Goal>): Goal => ({
  id: 'g', kind: 'questions', period: 'weekly', subject_key: null, target: 100, target_label: null, due_date: null,
  created_at: '2026-09-01T10:00:00Z', archived_at: null, ...o,
});
const act = (day: string, o: Partial<DailyActivity> = {}): DailyActivity => ({ day, questions: 0, correct: 0, xp: 0, practice_seconds: 0, reviews: 0, ...o });

describe('goals', () => {
  // Thursday 24 Sep 2026; the week runs Mon 21 – Sun 27.
  const today = '2026-09-24';

  it('counts only this week for weekly goals', () => {
    const p = goalProgress(goal({ target: 100 }), {
      activity: [act('2026-09-20', { questions: 500 }), act('2026-09-21', { questions: 30 }), act('2026-09-23', { questions: 25 })],
      papers: [], today,
    });
    expect(p.current).toBe(55);
    expect(p.window).toEqual({ start: '2026-09-21', end: '2026-09-27' });
    expect(p.daysLeft).toBe(3);
    expect(p.status).toBe('on_track'); // 55% done, 57% of the week elapsed
  });

  it('reports behind when well short of the pace', () => {
    const p = goalProgress(goal({ target: 100 }), { activity: [act('2026-09-21', { questions: 10 })], papers: [], today });
    expect(p.status).toBe('behind');
  });

  it('marks goals met', () => {
    const p = goalProgress(goal({ kind: 'practice_minutes', target: 30 }), { activity: [act('2026-09-22', { practice_seconds: 1900 })], papers: [], today });
    expect(p).toMatchObject({ current: 32, status: 'met', fraction: 1 });
  });

  it('does not judge accuracy on too few questions', () => {
    const p = goalProgress(goal({ kind: 'accuracy', target: 80 }), { activity: [act('2026-09-22', { questions: 5, correct: 5 })], papers: [], today });
    expect(p.status).toBe('not_enough_data');
    const q = goalProgress(goal({ kind: 'accuracy', target: 80 }), { activity: [act('2026-09-22', { questions: 25, correct: 18 })], papers: [], today });
    expect(q).toMatchObject({ current: 72, status: 'behind' });
  });

  it('tracks the latest paper score for a subject within a dated goal', () => {
    const papers: PaperAttempt[] = [
      { id: '1', paper_id: null, subject_key: 'igcse.physics', title: 'P4', score: 50, max_score: 80, completed_on: '2026-09-10', duration_minutes: null, reflection: null, created_at: '2026-09-10' },
      { id: '2', paper_id: null, subject_key: 'igcse.physics', title: 'P4', score: 66, max_score: 80, completed_on: '2026-09-20', duration_minutes: null, reflection: null, created_at: '2026-09-20' },
      { id: '3', paper_id: null, subject_key: 'igcse.chemistry', title: 'C', score: 80, max_score: 80, completed_on: '2026-09-21', duration_minutes: null, reflection: null, created_at: '2026-09-21' },
    ];
    const p = goalProgress(goal({ kind: 'paper_score', period: 'by_date', target: 80, subject_key: 'igcse.physics', due_date: '2026-10-30' }), { activity: [], papers, today });
    expect(p).toMatchObject({ current: 83, status: 'met' });
  });

  it('ends dated goals after the deadline', () => {
    const p = goalProgress(goal({ period: 'by_date', due_date: '2026-09-20', target: 50 }), { activity: [act('2026-09-05', { questions: 20 })], papers: [], today });
    expect(p.status).toBe('ended');
  });
});

describe('weekly report', () => {
  const today = '2026-09-24';
  const attempts = [
    ...Array.from({ length: 42 }, (_, i) => ({ subject_key: 'igcse.chemistry', topic_key: i < 12 ? 'organic' : 'physical', correct: !(i < 9), created_at: '2026-09-22T10:00:00Z' })),
    { subject_key: 'igcse.physics', topic_key: 'waves', correct: true, created_at: '2026-09-15T10:00:00Z' },
  ];
  const activity = [act('2026-09-22', { questions: 42, correct: 33, practice_seconds: 1500 }), act('2026-09-15', { questions: 20, correct: 16 })];

  it('states real counts, including the most-missed topic', () => {
    const r = buildWeeklyReport({ today, timezone: 'UTC', activity, attempts, stats: [], subjects: [] });
    expect(r.totals).toMatchObject({ questions: 42, correct: 33, accuracy: 79, practiceMinutes: 25, activeDays: 1 });
    expect(r.insights).toContain('You answered 42 IGCSE Chemistry questions (79% correct) and missed 9 of 12 on Organic chemistry.'.replace('IGCSE Chemistry', 'Chemistry'));
    expect(r.subjects[0]).toMatchObject({ subjectKey: 'igcse.chemistry', questions: 42, weakestTopic: { topicKey: 'organic', missed: 9 } });
  });

  it('compares with the previous week only when both weeks have enough data', () => {
    const r = buildWeeklyReport({ today, timezone: 'UTC', activity, attempts, stats: [], subjects: [] });
    expect(r.insights.some((s) => s.includes('accuracy is down 1') || s.includes('held steady'))).toBe(true);
  });

  it('says so plainly when there is no activity, and never invents praise', () => {
    const r = buildWeeklyReport({ today, timezone: 'UTC', activity: [], attempts: [], stats: [], subjects: [] });
    expect(r.insights).toEqual(['No practice recorded this week yet.']);
    expect(r.recommendations[0].kind).toBe('start');
    expect(JSON.stringify(r)).not.toMatch(/great|amazing|awesome/i);
  });

  it('recommends weak topics and untouched topics before an exam', () => {
    const stats = [stat({ subject_key: 'igcse.chemistry', topic_key: 'organic', attempts: 12, correct: 3, recent_score: 0.2 })];
    const r = buildWeeklyReport({ today, timezone: 'UTC', activity, attempts, stats,
      subjects: [{ subject_key: 'igcse.chemistry', exam_date: '2026-10-20', target_grade: 'A', confidence: null }] });
    expect(r.recommendations[0]).toMatchObject({ kind: 'weak_topic', topicKey: 'organic' });
    expect(r.recommendations.some((x) => x.kind === 'untouched' && x.reason.includes('26 days'))).toBe(true);
  });
});

describe('achievements', () => {
  it('derive from recorded data', () => {
    const a = evaluateAchievements({ xp: 0, longestStreak: 7, stats: [stat({ attempts: 120, correct: 90, recent_score: 0.8 })], papersLogged: 0, cardsReviewed: 0 });
    const byId = Object.fromEntries(a.map((x) => [x.id, x]));
    expect(byId.century.unlocked).toBe(true);
    expect(byId.week.unlocked).toBe(true);
    expect(byId.month.unlocked).toBe(false);
    expect(byId.secure_1.unlocked).toBe(true);
    expect(byId.paper_1.current).toBe(0);
  });
});

describe('formatMinutes', () => {
  it('never shows real practice as zero minutes', () => {
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(20)).toBe('<1 min');
    expect(formatMinutes(90)).toBe('2 min');
    expect(formatMinutes(3900)).toBe('1 h 5 min');
    expect(formatMinutes(7200)).toBe('2 h');
  });
});

describe('normalizeMathDelimiters', () => {
  it('turns backslash-paren and backslash-bracket maths into dollar delimiters outside code', async () => {
    const { normalizeMathDelimiters: n } = await import('@/lib/mathDelimiters');
    const r = String.raw;
    expect(n(r`Use \(V = I R\) here.`)).toBe('Use $V = I R$ here.');
    expect(n(r`Then \[ I = \frac{V}{R} \] done`)).toBe(r`Then ` + '\n$$\n' + r`I = \frac{V}{R}` + '\n$$\n' + ' done');
    const code = r`code ` + '`' + r`\(x\)` + '` and\n```\n' + r`\(y\)` + '\n```';
    expect(n(code)).toBe(code);
    expect(n('already $x$ fine')).toBe('already $x$ fine');
  });
});
