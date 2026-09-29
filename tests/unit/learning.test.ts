// Pure learning-side logic: exam plan, recommendations, flashcard dedupe,
// telemetry scrubbing and practice URL parsing.
import { describe, expect, it } from 'vitest';
import { BLOCK_MINUTES, blockLink, buildExamPlan, isStudyDay } from '@/lib/plan';
import { recommendNext, weakestSkills } from '@/lib/recommend';
import { cardSimilarity, dedupeCards } from '@/lib/cards';
import { scrub, scrubRoute } from '@/lib/telemetry';
import { skillTrend } from '@/lib/mastery';
import { addDays } from '@/lib/dates';
import type { DueReview, SkillMasteryRow, StudentMisconceptionRow } from '@/lib/types';

function m(skill_id: string, mastery: number, over: Partial<SkillMasteryRow> = {}): SkillMasteryRow {
  return {
    skill_id, attempts: 6, correct: 3, hints_used: 0, rating: 0, mastery, recent_score: 0.5, correct_streak: 0, incorrect_streak: 0,
    review_level: 0, interval_days: 0, next_review_at: null, first_seen_at: '', last_practiced_at: null, ...over,
  };
}

const PHYS = ['igcse.physics/electricity/resistance', 'igcse.physics/electricity/circuits', 'igcse.physics/waves/wave-properties', 'igcse.physics/thermal/thermal-energy'];
const CHEM = ['igcse.chemistry/physical/moles', 'igcse.chemistry/physical/rates', 'igcse.chemistry/organic/hydrocarbons'];
const today = '2026-09-28';

describe('exam plan', () => {
  it('spreads study days evenly and always starts today', () => {
    for (const d of [1, 3, 5, 7]) {
      const week = Array.from({ length: 7 }, (_, i) => isStudyDay(i, d));
      expect(week.filter(Boolean).length, `${d} days`).toBe(d);
      expect(week[0]).toBe(true);
    }
  });

  it('fills each study day with blocks that fit the time the student chose', () => {
    const { days } = buildExamPlan({
      today, minutesPerDay: 45, daysPerWeek: 5,
      subjects: [{ subjectKey: 'igcse.physics', examDate: addDays(today, 60), skills: PHYS }],
      mastery: [],
    });
    expect(days).toHaveLength(14);
    for (const d of days.filter((x) => x.study)) {
      expect(d.blocks.reduce((s, b) => s + b.minutes, 0)).toBeLessThanOrEqual(45);
      expect(d.blocks.length).toBeGreaterThan(0);
    }
    expect(days.filter((d) => !d.study).every((d) => d.blocks.length === 0)).toBe(true);
    expect(days[0].blocks.every((b) => b.minutes === BLOCK_MINUTES)).toBe(true);
  });

  it('puts due reviews first and weak skills of the nearest exam ahead of secure ones', () => {
    const mastery = [
      m(PHYS[0], 20, { next_review_at: `${today}T08:00:00Z` }),
      m(PHYS[1], 90), m(PHYS[2], 90), m(PHYS[3], 90),
      m(CHEM[0], 30), m(CHEM[1], 35), m(CHEM[2], 25),
    ];
    const { days } = buildExamPlan({
      today, minutesPerDay: 60, daysPerWeek: 7, mastery,
      subjects: [
        { subjectKey: 'igcse.physics', examDate: addDays(today, 90), skills: PHYS },
        { subjectKey: 'igcse.chemistry', examDate: addDays(today, 10), skills: CHEM },
      ],
    });
    expect(days[0].blocks[0].kind).toBe('review');
    const learning = days[0].blocks.filter((b) => b.kind !== 'review' && b.kind !== 'paper');
    expect(learning[0].subjectKey).toBe('igcse.chemistry');
    expect(learning[0].skillId).toBe(CHEM[2]); // weakest first
  });

  it('schedules a due review once, not again on every later day', () => {
    const { days } = buildExamPlan({
      today, minutesPerDay: 45, daysPerWeek: 7,
      mastery: [m(PHYS[0], 30, { next_review_at: `${today}T08:00:00Z` }), m(PHYS[1], 40, { next_review_at: `${addDays(today, 3)}T08:00:00Z` })],
      subjects: [{ subjectKey: 'igcse.physics', examDate: addDays(today, 90), skills: PHYS }],
    });
    const reviewDays = days.map((d, i) => (d.blocks.some((b) => b.kind === 'review') ? i : -1)).filter((i) => i >= 0);
    expect(reviewDays).toEqual([0, 3]);
  });

  it('schedules past papers in the last three weeks before an exam', () => {
    const { days } = buildExamPlan({
      today, minutesPerDay: 90, daysPerWeek: 6, mastery: [],
      subjects: [{ subjectKey: 'igcse.physics', examDate: addDays(today, 12), skills: PHYS }],
    });
    const papers = days.flatMap((d) => d.blocks).filter((b) => b.kind === 'paper');
    expect(papers.length).toBeGreaterThanOrEqual(2);
    expect(blockLink(papers[0])).toBe('/papers?subject=igcse.physics');
  });

  it('does not punish a missed day: the plan is rebuilt from today with no backlog', () => {
    const input = { minutesPerDay: 30, daysPerWeek: 5, mastery: [], subjects: [{ subjectKey: 'igcse.physics', examDate: '2026-12-01', skills: PHYS }] };
    const monday = buildExamPlan({ ...input, today });
    const tuesday = buildExamPlan({ ...input, today: addDays(today, 1) });
    // skipping Monday entirely does not make Tuesday longer
    expect(tuesday.days[0].blocks.length).toBe(monday.days[0].blocks.length);
  });

  it('ignores exams that have passed and reports how much is secure', () => {
    const { outlook, days } = buildExamPlan({
      today, minutesPerDay: 30, daysPerWeek: 5, mastery: [m(PHYS[0], 80), m(PHYS[1], 61)],
      subjects: [
        { subjectKey: 'igcse.physics', examDate: addDays(today, 30), skills: PHYS },
        { subjectKey: 'igcse.chemistry', examDate: addDays(today, -3), skills: CHEM },
      ],
    });
    expect(outlook).toEqual([{ subjectKey: 'igcse.physics', daysLeft: 30, secure: 2, total: 4 }]);
    expect(days.flatMap((d) => d.blocks).every((b) => b.subjectKey === 'igcse.physics')).toBe(true);
  });

  it('links blocks to the right practice', () => {
    expect(blockLink({ kind: 'practise', subjectKey: 'igcse.physics', skillId: PHYS[0], minutes: 15 })).toBe(`/practice?mode=guided&skill=${encodeURIComponent(PHYS[0])}`);
    expect(blockLink({ kind: 'review', subjectKey: 'igcse.physics', skillId: null, minutes: 15 })).toBe('/practice?mode=review&subject=igcse.physics');
  });
});

describe('recommended next step', () => {
  const name = (id: string) => id.split('/')[2];
  const due = (skill_id: string, incorrect_streak = 0): DueReview => ({ skill_id, subject_key: 'igcse.physics', topic_key: 'electricity', name: name(skill_id), mastery: 40, next_review_at: '', interval_days: 1, incorrect_streak });
  const misc = (skill_id: string, evidence_count: number): StudentMisconceptionRow => ({
    misconception_id: 'm1', evidence_count, avoided_count: 0, last_seen_at: '', resolved_at: null,
    misconception: { key: 'k', description: 'Multiplies voltage by resistance.', skill_id },
  });
  const base = { hasActivity: true, due: [], mastery: [], misconceptions: [], examInDays: null, skillName: name };

  it('starts new students with a warm-up and never invents data', () => {
    expect(recommendNext({ ...base, hasActivity: false })).toMatchObject({ kind: 'warmup', to: '/practice?mode=daily&count=10' });
  });

  it('prioritises due reviews, then recurring mistakes, then weak skills, then the exam plan', () => {
    expect(recommendNext({ ...base, due: [due(PHYS[0]), due(PHYS[1])] }).kind).toBe('review');
    expect(recommendNext({ ...base, misconceptions: [misc(PHYS[0], 3)] })).toMatchObject({ kind: 'fix_misconception', to: `/practice?mode=guided&skill=${encodeURIComponent(PHYS[0])}` });
    expect(recommendNext({ ...base, misconceptions: [misc(PHYS[0], 1)], mastery: [m(PHYS[1], 30)] }).kind).toBe('weak_skill');
    expect(recommendNext({ ...base, examInDays: 20 }).kind).toBe('exam_plan');
    expect(recommendNext(base).kind).toBe('daily');
  });

  it('orders weak skills by wrong streak, then mastery', () => {
    const w = weakestSkills([m(PHYS[0], 50), m(PHYS[1], 20), m(PHYS[2], 55, { incorrect_streak: 3 }), m(PHYS[3], 10, { attempts: 1 })]);
    expect(w.map((x) => x.skill_id)).toEqual([PHYS[2], PHYS[1], PHYS[0]]);
  });
});

describe('skill trend', () => {
  it('compares recent answers with overall accuracy', () => {
    expect(skillTrend({ attempts: 10, correct: 5, recent_score: 0.8 })).toBe('improving');
    expect(skillTrend({ attempts: 10, correct: 8, recent_score: 0.4 })).toBe('slipping');
    expect(skillTrend({ attempts: 10, correct: 5, recent_score: 0.55 })).toBe('steady');
    expect(skillTrend({ attempts: 2, correct: 0, recent_score: 1 })).toBe('steady');
  });
});

describe('flashcard dedupe', () => {
  it('drops rewordings of the same front and empty cards', () => {
    const cards = [
      { front: 'What is osmosis?', back: 'a' },
      { front: 'What is osmosis', back: 'b' },
      { front: 'Define osmosis.', back: 'c' },
      { front: 'What is diffusion?', back: 'd' },
      { front: '', back: 'e' },
      { front: 'Unit of charge', back: '' },
    ];
    const { kept, dropped } = dedupeCards(cards);
    expect(kept.map((c) => c.back)).toEqual(['a', 'd']);
    expect(dropped).toBe(4);
    expect(dedupeCards([{ front: 'What is diffusion?', back: 'x' }], ['what is DIFFUSION']).kept).toEqual([]);
    expect(cardSimilarity('Ohm’s law', 'Newton’s second law')).toBeLessThan(0.85);
  });
});

describe('telemetry scrubbing', () => {
  it('removes personal data before anything leaves the device', () => {
    const msg = scrub('Failed for sam@example.com with token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk key rk_test_abcdefgh1234 id 3f2c1b9a-1d2e-4f5a-8b9c-0d1e2f3a4b5c phone 07700900123');
    expect(msg).not.toMatch(/sam@|eyJ|rk_test|3f2c1b9a|07700900123/);
    expect(msg).toContain('[email]');
    expect(scrub('x'.repeat(1000))).toHaveLength(300);
    expect(scrubRoute('/tutor/3f2c1b9a-1d2e-4f5a-8b9c-0d1e2f3a4b5c?x=1')).toBe('/tutor/[id]');
  });
});
