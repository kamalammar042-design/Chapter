// ============================================================
// Exam preparation plan (pure; unit-tested)
// ------------------------------------------------------------
// The plan is rebuilt from today every time it is shown, using current
// mastery. Nothing is carried over from missed days, so a missed day never
// creates a backlog or a guilt-inducing "overdue" list: the next days simply
// adapt to what is left.
//
//   • study days follow the student's days-per-week preference
//   • each day is split into ~15-minute blocks
//   • due reviews come first, then the weakest skills of the subjects whose
//     exams are soonest and least secure
//   • in the last three weeks before an exam, past papers are scheduled
// ============================================================
import type { SkillMasteryRow } from './types';
import { addDays, daysBetween } from './dates';

export interface PlanSubject {
  subjectKey: string;
  examDate: string | null;
  /** full skill ids in this subject, in syllabus order */
  skills: string[];
}

export interface PlanInput {
  today: string;
  subjects: PlanSubject[];
  mastery: SkillMasteryRow[];
  minutesPerDay: number;
  daysPerWeek: number;
  horizonDays?: number;
}

export type BlockKind = 'review' | 'learn' | 'practise' | 'paper';

export interface PlanBlock {
  kind: BlockKind;
  subjectKey: string;
  skillId: string | null;
  minutes: number;
}

export interface PlanDay {
  date: string;
  study: boolean;
  blocks: PlanBlock[];
}

export interface SubjectOutlook {
  subjectKey: string;
  daysLeft: number | null;
  secure: number;
  total: number;
}

export const BLOCK_MINUTES = 15;
const SECURE = 60;

/** Spreads `daysPerWeek` study days evenly, starting today. */
export function isStudyDay(offset: number, daysPerWeek: number): boolean {
  const d = Math.min(7, Math.max(1, Math.round(daysPerWeek)));
  const shift = 6;
  return Math.floor((offset + shift + 1) * d / 7) - Math.floor((offset + shift) * d / 7) >= 1;
}

export function subjectOutlook(s: PlanSubject, mastery: Map<string, SkillMasteryRow>, today: string): SubjectOutlook {
  const secure = s.skills.filter((id) => (mastery.get(id)?.mastery ?? 0) >= SECURE).length;
  return { subjectKey: s.subjectKey, daysLeft: s.examDate ? daysBetween(today, s.examDate) : null, secure, total: s.skills.length };
}

export function buildExamPlan(input: PlanInput): { days: PlanDay[]; outlook: SubjectOutlook[] } {
  const horizon = input.horizonDays ?? 14;
  const mastery = new Map(input.mastery.map((m) => [m.skill_id, m]));
  const blocksPerDay = Math.max(1, Math.floor(Math.min(240, Math.max(10, input.minutesPerDay)) / BLOCK_MINUTES));
  const active = input.subjects.filter((s) => s.skills.length && (!s.examDate || daysBetween(input.today, s.examDate) >= 0));
  const outlook = active.map((s) => subjectOutlook(s, mastery, input.today));

  // how many times each skill has been planned so far (so the plan rotates)
  const planned = new Map<string, number>();
  const lastPaper = new Map<string, number>();
  const days: PlanDay[] = [];

  for (let offset = 0; offset < horizon; offset++) {
    const date = addDays(input.today, offset);
    const study = isStudyDay(offset, input.daysPerWeek);
    const day: PlanDay = { date, study, blocks: [] };
    days.push(day);
    if (!study || !active.length) continue;

    let slots = blocksPerDay;
    // 1. reviews due by this day (at most two blocks)
    const endOfDay = Date.parse(`${date}T23:59:59Z`);
    const dueToday = [...mastery.values()].filter((m) => m.next_review_at && Date.parse(m.next_review_at) <= endOfDay
      && active.some((s) => m.skill_id.startsWith(`${s.subjectKey}/`)) && !planned.has(`r:${m.skill_id}`));
    const reviewBlocks = Math.min(2, Math.ceil(dueToday.length / 3), slots);
    for (let i = 0; i < reviewBlocks; i++) {
      const group = dueToday.slice(i * 3, i * 3 + 3);
      day.blocks.push({ kind: 'review', subjectKey: group[0].skill_id.split('/')[0], skillId: null, minutes: BLOCK_MINUTES });
      for (const m of group) planned.set(`r:${m.skill_id}`, offset);
      slots--;
    }

    // 2. past papers (or a timed section of one) close to an exam, never more
    //    than half the day so weak skills still get attention
    const paperBlocks = Math.max(2, Math.min(4, Math.floor(blocksPerDay / 2)));
    for (const s of active) {
      if (!s.examDate || slots < paperBlocks + 1) continue;
      const left = daysBetween(date, s.examDate);
      const since = offset - (lastPaper.get(s.subjectKey) ?? -99);
      if (left >= 0 && left <= 21 && since >= (blocksPerDay >= 4 ? 4 : 7)) {
        const minutes = paperBlocks * BLOCK_MINUTES;
        day.blocks.push({ kind: 'paper', subjectKey: s.subjectKey, skillId: null, minutes });
        slots -= minutes / BLOCK_MINUTES;
        lastPaper.set(s.subjectKey, offset);
        break;
      }
    }

    // 3. weakest skills, weighted by exam urgency and how much is left to secure
    const weights = active.map((s) => {
      const left = s.examDate ? Math.max(1, daysBetween(date, s.examDate)) : 120;
      const need = s.skills.reduce((sum, id) => sum + (1 - (mastery.get(id)?.mastery ?? 0) / 100), 0) / s.skills.length;
      return { s, w: (0.25 + need) * (1 + 30 / left) };
    });
    const used = new Set<string>();
    while (slots > 0) {
      weights.sort((a, b) => b.w - a.w);
      const pick = weights[0];
      const candidates = pick.s.skills
        .filter((id) => !used.has(id))
        .map((id) => ({ id, m: mastery.get(id) }))
        .sort((a, b) => (planned.get(a.id) ?? 0) - (planned.get(b.id) ?? 0) || (a.m?.mastery ?? 0) - (b.m?.mastery ?? 0));
      const choice = candidates.find((c) => (c.m?.mastery ?? 0) < 85) ?? candidates[0];
      if (!choice) { pick.w = 0; if (weights.every((x) => x.w === 0)) break; continue; }
      used.add(choice.id);
      planned.set(choice.id, (planned.get(choice.id) ?? 0) + 1);
      day.blocks.push({ kind: (choice.m?.attempts ?? 0) < 2 ? 'learn' : 'practise', subjectKey: pick.s.subjectKey, skillId: choice.id, minutes: BLOCK_MINUTES });
      pick.w *= 0.55; // spread the day across subjects
      slots--;
    }
  }
  return { days, outlook };
}

/** Link for a plan block. */
export function blockLink(b: PlanBlock): string {
  switch (b.kind) {
    case 'review': return `/practice?mode=review&subject=${b.subjectKey}`;
    case 'paper': return `/papers?subject=${b.subjectKey}`;
    default: return b.skillId ? `/practice?mode=guided&skill=${encodeURIComponent(b.skillId)}` : `/practice?subject=${b.subjectKey}`;
  }
}
