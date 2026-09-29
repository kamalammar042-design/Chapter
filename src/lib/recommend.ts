// What should this student do next? Pure, so the rules are unit-tested.
// Everything comes from the student's own data; with no data the answer is
// a short warm-up, never an invented recommendation.
import type { DueReview, SkillMasteryRow, StudentMisconceptionRow } from './types';

export interface NextAction {
  kind: 'warmup' | 'review' | 'fix_misconception' | 'weak_skill' | 'exam_plan' | 'daily';
  title: string;
  body: string;
  to: string;
  cta: string;
}

export interface RecommendInput {
  hasActivity: boolean;
  due: DueReview[];
  mastery: SkillMasteryRow[];
  misconceptions: StudentMisconceptionRow[];
  /** days until the nearest exam, if any */
  examInDays: number | null;
  skillName: (id: string) => string;
}

const guided = (skillId: string) => `/practice?mode=guided&skill=${encodeURIComponent(skillId)}`;

export function weakestSkills(mastery: SkillMasteryRow[], limit = 3): SkillMasteryRow[] {
  return mastery.filter((m) => m.attempts >= 2 && m.mastery < 60)
    .sort((a, b) => b.incorrect_streak - a.incorrect_streak || a.mastery - b.mastery)
    .slice(0, limit);
}

export function recommendNext(i: RecommendInput): NextAction {
  if (!i.hasActivity) {
    return {
      kind: 'warmup', title: 'Take a 10-question warm-up', cta: 'Start warm-up', to: '/practice?mode=daily&count=10',
      body: 'A quick mix across your subjects so Chapter can find your strengths and the skills that need work.',
    };
  }
  if (i.due.length >= 2 || (i.due.length === 1 && i.due[0].incorrect_streak > 0)) {
    return {
      kind: 'review', title: `Review ${i.due.length} skill${i.due.length === 1 ? '' : 's'}`, cta: 'Start review', to: '/practice?mode=review',
      body: `${i.due.map((d) => d.name).slice(0, 2).join(' and ')}${i.due.length > 2 ? ` and ${i.due.length - 2} more` : ''} ${i.due.length === 1 ? 'is' : 'are'} due. Reviewing now, before you forget, is what makes it stick.`,
    };
  }
  const open = i.misconceptions.filter((m) => !m.resolved_at && m.misconception && m.evidence_count >= 2)
    .sort((a, b) => b.evidence_count - a.evidence_count);
  if (open.length) {
    const m = open[0];
    return {
      kind: 'fix_misconception', title: `Fix a recurring mistake in ${i.skillName(m.misconception!.skill_id)}`, cta: 'Practise this skill', to: guided(m.misconception!.skill_id),
      body: `You have made the same mistake ${m.evidence_count} times: ${m.misconception!.description.replace(/\.$/, '').toLowerCase()}. A guided session targets exactly this.`,
    };
  }
  const weak = weakestSkills(i.mastery, 1)[0];
  if (weak) {
    return {
      kind: 'weak_skill', title: `Strengthen ${i.skillName(weak.skill_id)}`, cta: 'Start guided practice', to: guided(weak.skill_id),
      body: `Mastery is ${weak.mastery}% after ${weak.attempts} answers. Guided practice starts at your level and steps up as you get questions right.`,
    };
  }
  if (i.due.length === 1) {
    return {
      kind: 'review', title: `Review ${i.due[0].name}`, cta: 'Start review', to: '/practice?mode=review',
      body: 'One skill is due for review. It takes a couple of minutes.',
    };
  }
  if (i.examInDays != null && i.examInDays <= 60) {
    return {
      kind: 'exam_plan', title: `Exam in ${i.examInDays} day${i.examInDays === 1 ? '' : 's'}`, cta: 'Open your plan', to: '/plan',
      body: 'Your plan spreads the topics you need across the days you have left, and adjusts if you miss a day.',
    };
  }
  return {
    kind: 'daily', title: 'Your daily mix', cta: 'Start practice', to: '/practice?mode=daily&count=10',
    body: '10 questions across your subjects, weighted towards the skills you have practised least.',
  };
}
