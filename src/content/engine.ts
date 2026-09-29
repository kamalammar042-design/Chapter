// ============================================================
// Practice engine
// ------------------------------------------------------------
// Turns the published questions the server returns (get_practice_pool)
// into a practice set that targets what the student needs:
//   • skills are weighted by weakness and by how overdue their review is;
//     untouched skills get a coverage boost; secure skills still resurface
//   • each skill is served at a difficulty that matches its mastery
//   • unseen questions come before recently answered ones
//   • procedural families produce a fresh instance every time
//   • the same skill never fills the set back to back when others exist
// Every question is checked before it is shown: no empty, NaN, undefined
// or duplicate options, and exactly one answer.
// Pure: the pool, mastery and the random source are passed in.
// ============================================================
import type { Difficulty, PoolRow, SkillMasteryRow, SourceType } from '@/lib/types';
import { getTemplate, instantiate } from './templates';

export interface Question {
  /** unique within a set: the question id, or id:seed for procedural instances */
  ref: string;
  questionId: string;
  kind: 'mcq' | 'procedural';
  templateKey: string | null;
  subjectKey: string;
  topicKey: string;
  skillId: string | null;
  q: string;
  /** options in display order */
  options: string[];
  /** display index of the answer */
  correct: number;
  /** display index → stored index (what submit_attempt expects) */
  order: number[];
  /** procedural: misconception key behind each displayed option */
  misconceptions: Array<string | null>;
  exp: string;
  hint: string | null;
  /** 1 Foundation … 5 Advanced */
  difficulty: number;
  source: SourceType;
  sourceName: string;
  recentlySeen: boolean;
}

export const DIFFICULTY_LABELS = ['Foundation', 'Developing', 'Standard', 'Challenging', 'Advanced'] as const;

export function difficultyLabel(d: number): string {
  return DIFFICULTY_LABELS[Math.min(5, Math.max(1, Math.round(d))) - 1];
}

/** The server's three XP bands (see private.xp_for). */
export function xpBand(d: number): Difficulty {
  return d <= 2 ? 'easy' : d === 3 ? 'medium' : 'hard';
}

const BAD = /\b(NaN|undefined|Infinity|null)\b/;

/** True if a question is safe to show: one answer, distinct non-empty options. */
export function isServable(q: Pick<Question, 'q' | 'options' | 'correct'>): boolean {
  if (!q.q.trim() || BAD.test(q.q)) return false;
  if (q.options.length < 2 || q.options.length > 6) return false;
  if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length) return false;
  const seen = new Set<string>();
  for (const o of q.options) {
    const t = o.trim().toLowerCase();
    if (!t || BAD.test(o) || seen.has(t)) return false;
    seen.add(t);
  }
  return true;
}

function shuffledOrder(n: number, rng: () => number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Shuffles answer options, keeping `correct` and `order` consistent. */
export function shuffleOptions(q: Question, rng: () => number = Math.random): Question {
  // keep "All/None of the above"-style answers in their written order
  if (q.options.some((o) => /of the above|^both\b|^neither\b/i.test(o))) return q;
  const order = shuffledOrder(q.options.length, rng);
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    correct: order.indexOf(q.correct),
    order: order.map((i) => q.order[i]),
    misconceptions: order.map((i) => q.misconceptions[i] ?? null),
  };
}

/**
 * A pool row as a ready-to-show question. Procedural rows are instantiated
 * with `rng`. Returns null for anything that fails the safety checks.
 */
export function fromPoolRow(row: PoolRow, rng: () => number, seed = 0): Question | null {
  const base = {
    questionId: row.id,
    templateKey: row.template_key,
    subjectKey: row.subject_key,
    topicKey: row.topic_key,
    skillId: row.skill_id,
    difficulty: row.difficulty,
    source: row.source_type,
    sourceName: row.source_name,
    recentlySeen: row.recently_seen,
  };
  let q: Question;
  if (row.question_type === 'procedural') {
    const t = getTemplate(row.template_key);
    if (!t) return null;
    const inst = instantiate(t, rng);
    if (!inst) return null;
    q = {
      ...base, kind: 'procedural', ref: `${row.id}:${seed}`, q: inst.stem, options: inst.options, correct: inst.correct,
      order: inst.options.map((_, i) => i), misconceptions: inst.misconceptions, exp: inst.explanation, hint: inst.hint,
    };
  } else {
    if (!Array.isArray(row.options) || row.correct_index == null) return null;
    const options = row.options.map((o) => String(o?.text ?? ''));
    q = shuffleOptions({
      ...base, kind: 'mcq', ref: row.id, q: row.stem, options, correct: row.correct_index,
      order: options.map((_, i) => i), misconceptions: options.map(() => null), exp: row.explanation ?? '', hint: row.hint,
    }, rng);
  }
  return isServable(q) ? q : null;
}

/** The difficulty band that stretches a student at this mastery. */
export function targetBand(mastery: number | undefined): [number, number] {
  const m = mastery ?? 0;
  if (m < 25) return [1, 2];
  if (m < 50) return [2, 3];
  if (m < 75) return [3, 4];
  return [4, 5];
}

/** Skill weight: weaker or overdue → higher. Never zero, so mastered skills resurface. */
export function skillWeight(m: SkillMasteryRow | undefined, now = Date.now()): number {
  if (!m || m.attempts === 0) return 0.8;
  let w = Math.max(0.15, 1 - m.mastery / 100);
  if (m.incorrect_streak >= 2) w *= 1.4;
  if (m.next_review_at && new Date(m.next_review_at).getTime() <= now) w *= 1.5;
  return w;
}

export interface BuildOptions {
  count: number;
  mastery?: Map<string, SkillMasteryRow>;
  /** fixed band, e.g. [4, 5]; otherwise each skill's band follows its mastery */
  band?: [number, number] | null;
  /** use each skill's mastery band (true) or accept any difficulty (false) */
  adaptive?: boolean;
  rng?: () => number;
  /** refs to avoid (e.g. already used in this session) */
  exclude?: Set<string>;
}

function weightedPick<T>(items: Array<{ item: T; w: number }>, rng: () => number): T | null {
  const total = items.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const x of items) {
    r -= x.w;
    if (r <= 0) return x.item;
  }
  return items[items.length - 1]?.item ?? null;
}

const bandDistance = (d: number, [lo, hi]: [number, number]) => (d < lo ? lo - d : d > hi ? d - hi : 0);

export function buildPracticeSet(pool: PoolRow[], opts: BuildOptions): Question[] {
  const rng = opts.rng ?? Math.random;
  const mastery = opts.mastery ?? new Map<string, SkillMasteryRow>();
  const adaptive = opts.adaptive ?? true;

  const groups = new Map<string, PoolRow[]>();
  for (const r of pool) {
    const k = r.skill_id ?? `${r.subject_key}/${r.topic_key}`;
    const g = groups.get(k);
    if (g) g.push(r); else groups.set(k, [r]);
  }

  const out: Question[] = [];
  const usedRows = new Map<string, number>();
  const taken = new Set(opts.exclude ?? []);
  const takenText = new Set<string>();
  let lastSkill: string | null = null;
  let guard = 0;

  while (out.length < opts.count && groups.size && guard++ < opts.count * 30) {
    const entries = [...groups.entries()];
    const candidates = entries.length > 1 ? entries.filter(([k]) => k !== lastSkill) : entries;
    const pick = weightedPick(candidates.map(([k, rows]) => ({ item: [k, rows] as const, w: skillWeight(mastery.get(k)) })), rng);
    if (!pick) break;
    const [skill, rows] = pick;

    const band = opts.band ?? (adaptive ? targetBand(mastery.get(skill)?.mastery) : null);
    const available = rows.filter((r) => {
      const n = usedRows.get(r.id) ?? 0;
      return r.question_type === 'procedural' ? n < 2 : n === 0 && !taken.has(r.id);
    });
    if (!available.length) { groups.delete(skill); continue; }

    // closest to the band first, then unseen, then random
    const scored = available
      .map((r) => ({ r, s: (band ? bandDistance(r.difficulty, band) * 10 : 0) + (r.recently_seen ? 5 : 0) + (usedRows.has(r.id) ? 3 : 0) + rng() }))
      .sort((a, b) => a.s - b.s);

    let q: Question | null = null;
    for (const { r } of scored.slice(0, 4)) {
      const n = usedRows.get(r.id) ?? 0;
      const candidate = fromPoolRow(r, rng, n);
      usedRows.set(r.id, n + 1);
      if (candidate && !taken.has(candidate.ref) && !takenText.has(candidate.q)) { q = candidate; break; }
    }
    if (!q) continue;
    out.push(q);
    taken.add(q.ref);
    takenText.add(q.q);
    lastSkill = skill;
  }
  return out;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
