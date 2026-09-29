// League ladder (lifetime XP) and XP rules. XP itself is awarded by the
// database; xpFor mirrors private.xp_for so the UI can show what an answer
// earned immediately.
import type { Difficulty } from './types';

export interface League { name: string; at: number }

// Early tiers arrive quickly; later tiers take sustained work.
// At ~20 XP per correct answer, Silver ≈ 50 correct answers.
export const LEAGUES: League[] = [
  { name: 'Bronze', at: 0 },
  { name: 'Silver', at: 1000 },
  { name: 'Gold', at: 2500 },
  { name: 'Sapphire', at: 5000 },
  { name: 'Ruby', at: 9000 },
  { name: 'Emerald', at: 14000 },
  { name: 'Amethyst', at: 20000 },
  { name: 'Diamond', at: 28000 },
  { name: 'Obsidian', at: 40000 },
];

export const LEAGUE_COLORS: Record<string, string> = {
  Bronze: '#C08457', Silver: '#A8B0BD', Gold: '#E5B64A', Sapphire: '#5B8DEF', Ruby: '#E0566F',
  Emerald: '#3BB98A', Amethyst: '#A67CF2', Diamond: '#7FD3E8', Obsidian: '#6B6B80',
};

export function leagueFor(xp: number): { current: League; next: League | null; progress: number; toNext: number } {
  let idx = 0;
  for (let i = 0; i < LEAGUES.length; i++) if (xp >= LEAGUES[i].at) idx = i;
  const current = LEAGUES[idx];
  const next = LEAGUES[idx + 1] ?? null;
  if (!next) return { current, next: null, progress: 1, toNext: 0 };
  return {
    current,
    next,
    progress: Math.min(1, Math.max(0, (xp - current.at) / (next.at - current.at))),
    toNext: Math.max(0, next.at - xp),
  };
}

export function xpFor(difficulty: Difficulty, correct: boolean): number {
  if (!correct) return 0;
  return difficulty === 'hard' ? 35 : difficulty === 'medium' ? 20 : 10;
}
