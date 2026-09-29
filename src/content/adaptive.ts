// ============================================================
// Guided practice: the adaptive loop for one skill
// ------------------------------------------------------------
//   diagnose  two probe questions find the starting level
//   practise  two unaided correct answers in a row → one level harder;
//             a wrong answer → the concept card, one level easier, and a
//             different question on the same skill
//   stretch   at Challenging/Advanced: two unaided correct answers in a
//             row finish the session ("ready for review")
//   done      mastered, reached the session length, or three wrong in a
//             row (hand over to an explanation instead of more questions)
// Retention is checked later: the server schedules the skill for spaced
// review, and the review session serves different questions.
// Pure and deterministic, so the rules are unit-tested.
// ============================================================

export type GuidedPhase = 'diagnose' | 'practise' | 'stretch' | 'done';
export type GuidedEnd = 'mastered' | 'length' | 'struggling';

export interface GuidedState {
  phase: GuidedPhase;
  /** target difficulty for the next question, 1–5 */
  level: number;
  answered: number;
  correctRun: number;
  wrongRun: number;
  /** show the concept card before the next question */
  explainNext: boolean;
  end: GuidedEnd | null;
  history: Array<{ difficulty: number; correct: boolean; hinted: boolean }>;
}

export const GUIDED_LENGTH = 12;
const clamp = (n: number) => Math.min(5, Math.max(1, n));

export function startGuided(mastery: number | undefined): GuidedState {
  const m = mastery ?? 0;
  const level = m >= 75 ? 4 : m >= 50 ? 3 : 2;
  return { phase: 'diagnose', level, answered: 0, correctRun: 0, wrongRun: 0, explainNext: false, end: null, history: [] };
}

export function advanceGuided(s: GuidedState, r: { difficulty: number; correct: boolean; hinted: boolean }): GuidedState {
  if (s.phase === 'done') return s;
  const unaided = r.correct && !r.hinted;
  const n: GuidedState = {
    ...s,
    answered: s.answered + 1,
    explainNext: false,
    history: [...s.history, r],
  };

  if (s.phase === 'diagnose') {
    n.level = clamp(r.correct ? r.difficulty + 1 : r.difficulty - 1);
    n.correctRun = unaided ? s.correctRun + 1 : 0;
    n.wrongRun = r.correct ? 0 : s.wrongRun + 1;
    n.explainNext = !r.correct && n.answered >= 2;
    if (n.answered >= 2) {
      n.phase = n.level >= 4 ? 'stretch' : 'practise';
      n.correctRun = 0;
    }
  } else if (r.correct) {
    n.wrongRun = 0;
    n.correctRun = unaided ? s.correctRun + 1 : 0;
    if (s.phase === 'stretch' && n.correctRun >= 2 && r.difficulty >= 4) {
      return { ...n, phase: 'done', end: 'mastered' };
    }
    if (n.correctRun >= 2) {
      n.level = clamp(s.level + 1);
      n.correctRun = 0;
      if (n.level >= 4) n.phase = 'stretch';
    }
  } else {
    n.correctRun = 0;
    n.wrongRun = s.wrongRun + 1;
    n.level = clamp(s.level - 1);
    n.explainNext = true;
    if (n.level < 4) n.phase = 'practise';
    if (n.wrongRun >= 3) return { ...n, phase: 'done', end: 'struggling', explainNext: false };
  }

  if (n.answered >= GUIDED_LENGTH) return { ...n, phase: 'done', end: n.end ?? 'length', explainNext: false };
  return n;
}

/** Difficulty band for the next question. */
export function guidedBand(s: GuidedState): [number, number] {
  return [s.level, s.level];
}

/** What to do after a guided session, in plain words. */
export function guidedAdvice(s: GuidedState): { title: string; body: string } {
  const right = s.history.filter((h) => h.correct).length;
  switch (s.end) {
    case 'mastered':
      return {
        title: 'Ready for review',
        body: 'You answered the hardest questions on this skill without help. Chapter will bring it back in a few days to check it has stuck.',
      };
    case 'struggling':
      return {
        title: 'Let’s look at the idea again',
        body: 'Three in a row went wrong, so more questions will not help yet. Read the explanation or ask the tutor to walk through one, then try again.',
      };
    default:
      return right / Math.max(1, s.history.length) >= 0.7
        ? { title: 'Good progress', body: `You reached ${['Foundation', 'Developing', 'Standard', 'Challenging', 'Advanced'][s.level - 1]} level. Another session will push you further.` }
        : { title: 'Keep building', body: 'You are getting there. Review the questions you missed, then run another guided session tomorrow.' };
  }
}
