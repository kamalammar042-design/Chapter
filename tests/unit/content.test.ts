import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { SUBJECTS, getSubject, subjectsFor } from '@/content/catalog';
import { SECTIONS, READING_PASSAGES } from '@/content/bank';
import { WRITTEN } from '@/content/written';
import { WRITTEN_MAP } from '@/content/extras';
import { SKILLS, classifyQuestion, skillById } from '@/content/skills';
import { TEMPLATES, instantiate } from '@/content/templates';
import { MISCONCEPTIONS } from '@/content/misconceptions';
import { OFFICIAL_RESOURCES } from '@/content/official-resources';
import {
  buildPracticeSet, difficultyLabel, fromPoolRow, isServable, mulberry32, shuffleOptions, skillWeight, targetBand, xpBand, type Question,
} from '@/content/engine';
import { GUIDED_LENGTH, advanceGuided, guidedAdvice, startGuided, type GuidedState } from '@/content/adaptive';
import type { PoolRow, SkillMasteryRow } from '@/lib/types';
import { buildRows } from '../../scripts/generate-content-sql';

describe('catalogue', () => {
  it('has unique subject and topic keys matching the database format', () => {
    const keys = SUBJECTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of SUBJECTS) {
      expect(s.key).toMatch(/^[a-z0-9_.-]{2,40}$/);
      const tks = s.topics.map((t) => t.key);
      expect(new Set(tks).size, s.key).toBe(tks.length);
      for (const t of s.topics) expect(t.key).toMatch(/^[a-z0-9-]{1,48}$/);
    }
  });

  it('covers the IGCSE and SAT subjects Chapter promises', () => {
    expect(subjectsFor('igcse').map((s) => s.name).sort()).toEqual(
      ['Biology', 'Business', 'Chemistry', 'Computer Science', 'Economics', 'English', 'Mathematics', 'Physics']);
    expect(subjectsFor('sat').map((s) => s.name).sort()).toEqual(['Math', 'Reading & Writing']);
  });

  it('keeps the database seeds in sync with the sources', { timeout: 60_000 }, () => {
    expect(() => execFileSync('node', ['scripts/generate-catalog-sql.mjs', '--check'], { stdio: 'pipe' })).not.toThrow();
    expect(() => execFileSync(process.execPath, ['--import', 'tsx', 'scripts/generate-content-sql.ts', '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});

describe('skills taxonomy', () => {
  it('breaks every topic into skills with objectives and valid ids', () => {
    for (const s of SUBJECTS) {
      for (const t of s.topics) {
        const skills = SKILLS[`${s.key}/${t.key}`] ?? [];
        expect(skills.length, `${s.key}/${t.key}`).toBeGreaterThanOrEqual(2);
        for (const k of skills) {
          expect(`${s.key}/${t.key}/${k.key}`).toMatch(/^[a-z0-9_.-]+\/[a-z0-9-]+\/[a-z0-9-]+$/);
          expect(k.objective.length).toBeGreaterThan(15);
        }
      }
    }
  });

  it('classifies by whole words, not fragments', () => {
    // "mole" must not match inside "molecule"
    expect(classifyQuestion('igcse.chemistry', 'physical', 'How many moles are in 36 g of water?', ['physical'])?.skillKey).toBe('moles');
    expect(skillById('igcse.physics/electricity/resistance')?.name).toBeTruthy();
    expect(skillById('nope/nope/nope')).toBeUndefined();
  });

  it('keys curated misconceptions to real skills', () => {
    for (const skill of Object.keys(MISCONCEPTIONS)) expect(skillById(skill), skill).toBeTruthy();
  });
});

describe('content seed', () => {
  const { rows, stats } = buildRows();

  it('publishes only classified questions with explicit provenance', () => {
    expect(rows.length).toBeGreaterThan(350);
    expect(rows.filter((r) => r.skill).length / rows.length).toBeGreaterThan(0.9);
    for (const r of rows) {
      expect(['legacy', 'original']).toContain(r.source);
      if (r.skill) expect(r.skill.startsWith(`${r.subject}/${r.topic}/`), r.stem).toBe(true);
    }
    expect(stats.excludedLevel).toBeGreaterThan(0); // A-level material kept out
  });

  it('has well-formed questions: text, distinct options, one valid answer, an explanation', () => {
    const problems: string[] = [];
    for (const r of rows) {
      const q: Question = { ...base(), q: r.stem, options: r.options, correct: r.correct };
      if (!isServable(q)) problems.push(r.stem.slice(0, 60));
      if (!r.explanation.trim()) problems.push(`no explanation: ${r.stem.slice(0, 60)}`);
      if (r.difficulty < 1 || r.difficulty > 5) problems.push(`bad difficulty: ${r.stem.slice(0, 60)}`);
    }
    expect(problems).toEqual([]);
  });

  it('gives every topic some practice: seeded questions or a procedural family', () => {
    const covered = new Set([...rows.filter((r) => r.skill).map((r) => `${r.subject}/${r.topic}`), ...TEMPLATES.map((t) => t.skillId.split('/').slice(0, 2).join('/'))]);
    const missing = SUBJECTS.flatMap((s) => s.topics.map((t) => `${s.key}/${t.key}`)).filter((k) => !covered.has(k));
    expect(missing).toEqual([]);
  });

  it('links the official directory to https publisher pages only', () => {
    expect(OFFICIAL_RESOURCES.length).toBeGreaterThanOrEqual(15);
    for (const r of OFFICIAL_RESOURCES) {
      expect(r.url).toMatch(/^https:\/\/(www\.cambridgeinternational\.org|satsuite\.collegeboard\.org|bluebook\.collegeboard\.org|www\.khanacademy\.org)\//);
      if (r.subjectKey) expect(getSubject(r.subjectKey), r.subjectKey).toBeTruthy();
    }
  });

  it('has valid reading passages and written questions', () => {
    for (const p of READING_PASSAGES) {
      expect(p.text.length).toBeGreaterThan(200);
      for (const q of p.questions) expect(q.options).toHaveLength(4);
    }
    for (const w of WRITTEN) {
      const map = WRITTEN_MAP[w.subjectId];
      expect(map, `subject ${w.subjectId}`).toBeTruthy();
      expect(getSubject(map.subject)?.topics.some((t) => t.key === map.topics[w.topic])).toBe(true);
      expect(w.sampleAnswer?.length).toBeGreaterThan(10);
    }
    expect(Object.keys(SECTIONS).length).toBeGreaterThan(10);
  });
});

describe('procedural templates', () => {
  it('cover all five difficulty levels and every subject with calculations', () => {
    expect(new Set(TEMPLATES.map((t) => t.difficulty))).toEqual(new Set([1, 2, 3, 4, 5]));
    for (const t of TEMPLATES) expect(skillById(t.skillId), t.key).toBeTruthy();
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(TEMPLATES.length);
  });

  it('never produce NaN, Infinity, undefined, empty or duplicate options, or more than one answer (fuzz)', () => {
    for (const t of TEMPLATES) {
      const rng = mulberry32(t.key.length * 7919);
      let produced = 0;
      for (let i = 0; i < 150; i++) {
        const inst = instantiate(t, rng);
        if (!inst) continue;
        produced++;
        const where = `${t.key}: ${inst.stem}`;
        expect(inst.options, where).toHaveLength(4);
        expect(new Set(inst.options.map((o) => o.toLowerCase())).size, where).toBe(4);
        expect(inst.options.join('|') + inst.stem + inst.explanation, where).not.toMatch(/NaN|undefined|Infinity|null/);
        expect(inst.options.every((o) => o.trim().length > 0), where).toBe(true);
        expect(inst.misconceptions[inst.correct], where).toBeNull();
        expect(inst.hint.length, where).toBeGreaterThan(5);
      }
      expect(produced, t.key).toBeGreaterThan(120);
    }
  }, 60_000);

  it('vary the question, not just the numbers', () => {
    const t = TEMPLATES.find((x) => x.key === 'phys.ohm')!;
    const rng = mulberry32(3);
    const openings = new Set<string>();
    for (let i = 0; i < 200; i++) openings.add(instantiate(t, rng)!.stem.split(/\d/)[0].slice(0, 20));
    expect(openings.size).toBeGreaterThan(2);
  });

  it('tag distractors with curated misconception keys only', () => {
    for (const t of TEMPLATES) {
      const known = new Set((MISCONCEPTIONS[t.skillId] ?? []).map(([k]) => k));
      const rng = mulberry32(5);
      for (let i = 0; i < 50; i++) {
        const inst = instantiate(t, rng);
        for (const m of inst?.misconceptions ?? []) if (m) expect(known.has(m), `${t.key}: ${m}`).toBe(true);
      }
    }
  });
});

// ---- practice engine ------------------------------------------------------------

function base(): Question {
  return {
    ref: 'x', questionId: 'x', kind: 'mcq', templateKey: null, subjectKey: 's', topicKey: 't', skillId: null, q: 'Q?',
    options: ['a', 'b', 'c', 'd'], correct: 0, order: [0, 1, 2, 3], misconceptions: [null, null, null, null], exp: '', hint: null,
    difficulty: 3, source: 'owned', sourceName: 'test', recentlySeen: false,
  };
}

let n = 0;
function row(over: Partial<PoolRow> = {}): PoolRow {
  n++;
  return {
    id: `q${n}`, subject_key: 'igcse.physics', topic_key: 'electricity', skill_id: 'igcse.physics/electricity/resistance',
    question_type: 'mcq', template_key: null, stem: `Question number ${n}?`, options: [{ text: `a${n}` }, { text: `b${n}` }, { text: `c${n}` }, { text: `d${n}` }],
    correct_index: 1, explanation: 'Because.', hint: null, difficulty: 3, cognitive_level: 'apply', source_type: 'owned', source_name: 'test',
    recently_seen: false, ...over,
  };
}

function mastery(skill_id: string, m: number, over: Partial<SkillMasteryRow> = {}): SkillMasteryRow {
  return {
    skill_id, attempts: 10, correct: 5, hints_used: 0, rating: 0, mastery: m, recent_score: 0.5, correct_streak: 0, incorrect_streak: 0,
    review_level: 0, interval_days: 0, next_review_at: null, first_seen_at: '', last_practiced_at: null, ...over,
  };
}

describe('practice engine', () => {
  it('turns pool rows into questions whose order maps back to the stored answer', () => {
    for (let seed = 0; seed < 30; seed++) {
      const r = row();
      const q = fromPoolRow(r, mulberry32(seed))!;
      expect(q.options[q.correct]).toBe(r.options[r.correct_index!].text);
      expect(q.order[q.correct]).toBe(r.correct_index);
      q.options.forEach((text, i) => expect(r.options[q.order[i]].text).toBe(text));
    }
  });

  it('refuses rows that are not safe to show', () => {
    const rng = mulberry32(1);
    expect(fromPoolRow(row({ options: [{ text: 'a' }, { text: 'a' }, { text: 'b' }] }), rng)).toBeNull();
    expect(fromPoolRow(row({ options: [{ text: 'NaN' }, { text: '2' }, { text: '3' }] }), rng)).toBeNull();
    expect(fromPoolRow(row({ options: [{ text: '' }, { text: '2' }, { text: '3' }] }), rng)).toBeNull();
    expect(fromPoolRow(row({ correct_index: 7 }), rng)).toBeNull();
    expect(fromPoolRow(row({ correct_index: null }), rng)).toBeNull();
    expect(fromPoolRow(row({ question_type: 'procedural', template_key: 'no-such-template' }), rng)).toBeNull();
  });

  it('instantiates procedural rows with a fresh, checked question each time', () => {
    const r = row({ question_type: 'procedural', template_key: 'phys.ohm', options: [], correct_index: null });
    const rng = mulberry32(9);
    const a = fromPoolRow(r, rng, 0)!;
    const b = fromPoolRow(r, rng, 1)!;
    expect(a.kind).toBe('procedural');
    expect(a.ref).not.toBe(b.ref);
    expect(isServable(a) && isServable(b)).toBe(true);
  });

  it('builds a set without repeats and never the same skill back to back when others exist', () => {
    const pool = [
      ...Array.from({ length: 8 }, () => row({ skill_id: 'igcse.physics/electricity/resistance' })),
      ...Array.from({ length: 8 }, () => row({ skill_id: 'igcse.physics/electricity/circuits' })),
    ];
    const qs = buildPracticeSet(pool, { count: 10, rng: mulberry32(2), adaptive: false });
    expect(qs).toHaveLength(10);
    expect(new Set(qs.map((q) => q.ref)).size).toBe(10);
    for (let i = 1; i < qs.length; i++) expect(qs[i].skillId).not.toBe(qs[i - 1].skillId);
  });

  it('serves each skill at a difficulty that matches its mastery', () => {
    const skill = 'igcse.physics/electricity/resistance';
    const pool = [1, 2, 3, 4, 5].flatMap((d) => Array.from({ length: 4 }, () => row({ difficulty: d, skill_id: skill })));
    const weak = buildPracticeSet(pool, { count: 4, mastery: new Map([[skill, mastery(skill, 10)]]), rng: mulberry32(3) });
    expect(weak.every((q) => q.difficulty <= 2)).toBe(true);
    const strong = buildPracticeSet(pool, { count: 4, mastery: new Map([[skill, mastery(skill, 90)]]), rng: mulberry32(3) });
    expect(strong.every((q) => q.difficulty >= 4)).toBe(true);
    expect(targetBand(undefined)).toEqual([1, 2]);
    expect(targetBand(60)).toEqual([3, 4]);
  });

  it('prefers questions the student has not seen recently', () => {
    const pool = [row({ recently_seen: true }), row({ recently_seen: true }), row(), row()];
    const qs = buildPracticeSet(pool, { count: 2, rng: mulberry32(4), adaptive: false });
    expect(qs.every((q) => !q.recentlySeen)).toBe(true);
  });

  it('targets weak and overdue skills more often than secure ones', () => {
    const weakSkill = 'igcse.physics/electricity/resistance';
    const strongSkill = 'igcse.physics/electricity/circuits';
    const m = new Map([
      [weakSkill, mastery(weakSkill, 20, { incorrect_streak: 2 })],
      [strongSkill, mastery(strongSkill, 95)],
    ]);
    expect(skillWeight(m.get(weakSkill))).toBeGreaterThan(skillWeight(m.get(strongSkill)) * 5);
    expect(skillWeight(mastery('x', 95, { next_review_at: '2000-01-01T00:00:00Z' }))).toBeGreaterThan(skillWeight(mastery('x', 95)));
    expect(skillWeight(mastery('x', 100))).toBeGreaterThan(0); // mastered skills still resurface
  });

  it('shuffles options while keeping the correct answer and the stored mapping', () => {
    const q = { ...base(), correct: 2 };
    for (let seed = 0; seed < 20; seed++) {
      const s = shuffleOptions(q, mulberry32(seed));
      expect(s.options[s.correct]).toBe('c');
      expect(s.order[s.correct]).toBe(2);
      expect([...s.options].sort()).toEqual(['a', 'b', 'c', 'd']);
    }
    const fixed = { ...base(), options: ['1', '2', 'Both of the above', 'Neither'] };
    expect(shuffleOptions(fixed, mulberry32(1)).options).toEqual(fixed.options);
  });

  it('shows the correct answer in every position about equally often', () => {
    const rng = mulberry32(99);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 2000; i++) counts[shuffleOptions({ ...base(), correct: 1 }, rng).correct]++;
    for (const c of counts) expect(c / 2000).toBeGreaterThan(0.2);
  });

  it('labels difficulty on the five-level scale', () => {
    expect([1, 2, 3, 4, 5].map(difficultyLabel)).toEqual(['Foundation', 'Developing', 'Standard', 'Challenging', 'Advanced']);
    expect([1, 2, 3, 4, 5].map(xpBand)).toEqual(['easy', 'easy', 'medium', 'hard', 'hard']);
  });
});

describe('guided adaptive loop', () => {
  const step = (s: GuidedState, correct: boolean, hinted = false) => advanceGuided(s, { difficulty: s.level, correct, hinted });

  it('starts from mastery and uses two probe questions to find the level', () => {
    expect(startGuided(undefined).level).toBe(2);
    expect(startGuided(80).level).toBe(4);
    let s = startGuided(40);
    s = step(s, true);
    expect(s.phase).toBe('diagnose');
    expect(s.level).toBe(3);
    s = step(s, true);
    expect(s.level).toBe(4);
    expect(s.phase).toBe('stretch');
  });

  it('explains after a mistake, steps down a level, and escalates after two unaided correct answers', () => {
    let s = startGuided(40);
    s = step(s, false); // probe 1 wrong → level 1
    s = step(s, true); // probe 2 right → level 2
    expect(s.phase).toBe('practise');
    s = step(s, false);
    expect(s.explainNext).toBe(true);
    expect(s.level).toBe(1);
    s = step(s, true);
    expect(s.explainNext).toBe(false);
    s = step(s, true);
    expect(s.level).toBe(2);
  });

  it('does not escalate on hinted answers', () => {
    let s: GuidedState = { ...startGuided(40), phase: 'practise', level: 3, answered: 2 };
    s = step(s, true, true);
    s = step(s, true, true);
    expect(s.level).toBe(3);
  });

  it('finishes as mastered after two unaided correct answers at Challenging or above', () => {
    let s = startGuided(80);
    s = step(s, true);
    s = step(s, true);
    expect(s.phase).toBe('stretch');
    s = step(s, true);
    s = step(s, true);
    expect(s).toMatchObject({ phase: 'done', end: 'mastered' });
    expect(guidedAdvice(s).title).toMatch(/review/i);
  });

  it('stops after three wrong in a row instead of piling on questions', () => {
    let s: GuidedState = { ...startGuided(40), phase: 'practise', answered: 2 };
    s = step(s, false);
    s = step(s, false);
    s = step(s, false);
    expect(s).toMatchObject({ phase: 'done', end: 'struggling' });
    expect(guidedAdvice(s).body).toMatch(/explanation|tutor/);
  });

  it('never runs longer than the session length', () => {
    let s = startGuided(40);
    for (let i = 0; i < 40 && s.phase !== 'done'; i++) s = step(s, i % 2 === 0);
    expect(s.phase).toBe('done');
    expect(s.answered).toBeLessThanOrEqual(GUIDED_LENGTH);
  });
});

describe('past paper import', () => {
  it('parses Cambridge file names', async () => {
    const { parseCambridge } = await import('../../scripts/import-past-papers.mjs');
    expect(parseCambridge('0625_s24_qp_42.pdf')).toMatchObject({
      subject_key: 'igcse.physics', year: 2024, session: 'may_jun', paper_number: 4, variant: 2,
    });
    expect(parseCambridge('0620_w23_ms_2.pdf')).toMatchObject({ subject_key: 'igcse.chemistry', session: 'oct_nov', variant: null });
    expect(parseCambridge('9999_s24_qp_1.pdf')).toBeNull();
    expect(parseCambridge('notes.pdf')).toBeNull();
  });
});
