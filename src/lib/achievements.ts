// Achievements are derived from recorded data every time; nothing is stored
// that could drift from reality. Each rewards real study, not app usage.
import type { TopicStat } from './types';
import { topicMastery } from './mastery';

export interface AchievementInput {
  xp: number;
  longestStreak: number;
  stats: TopicStat[];
  papersLogged: number;
  cardsReviewed: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  target: number;
  value: (i: AchievementInput) => number;
}

const totalAnswers = (i: AchievementInput) => i.stats.reduce((s, t) => s + t.attempts, 0);
const totalCorrect = (i: AchievementInput) => i.stats.reduce((s, t) => s + t.correct, 0);
const securedTopics = (i: AchievementInput) => i.stats.filter((t) => topicMastery(t) >= 75).length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_steps', title: 'First steps', description: 'Answer your first 10 questions.', target: 10, value: totalAnswers },
  { id: 'century', title: 'Century', description: 'Answer 100 questions.', target: 100, value: totalAnswers },
  { id: 'thousand', title: 'Thousand', description: 'Answer 1,000 questions.', target: 1000, value: totalAnswers },
  { id: 'sharp', title: 'Sharp mind', description: 'Get 500 answers right.', target: 500, value: totalCorrect },
  { id: 'week', title: 'Consistent', description: 'Study 7 days in a row.', target: 7, value: (i) => i.longestStreak },
  { id: 'month', title: 'Unbreakable', description: 'Study 30 days in a row.', target: 30, value: (i) => i.longestStreak },
  { id: 'secure_1', title: 'Solid ground', description: 'Reach Secure mastery in a topic.', target: 1, value: securedTopics },
  { id: 'secure_10', title: 'Well rounded', description: 'Reach Secure mastery in 10 topics.', target: 10, value: securedTopics },
  { id: 'paper_1', title: 'Exam conditions', description: 'Log your first past paper.', target: 1, value: (i) => i.papersLogged },
  { id: 'paper_10', title: 'Paper trail', description: 'Log 10 past papers.', target: 10, value: (i) => i.papersLogged },
  { id: 'cards_100', title: 'Recall', description: 'Review 100 flashcards.', target: 100, value: (i) => i.cardsReviewed },
];

export function evaluateAchievements(input: AchievementInput) {
  return ACHIEVEMENTS.map((a) => {
    const v = a.value(input);
    return { ...a, current: Math.min(v, a.target), unlocked: v >= a.target };
  });
}
