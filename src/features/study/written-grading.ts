// Instant keyword check for short written answers. It checks for the ideas
// a mark scheme looks for; it is not a substitute for marking, and the UI
// says so and offers tutor feedback.
import type { WrittenQuestion } from '@/content/written';

export interface Check { label: string; ok: boolean }
export interface WrittenResult { score: number; checks: Check[]; pass: boolean }

const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const stem = (w: string) => w.toLowerCase().slice(0, Math.max(4, w.length - 3));

export function gradeWritten(q: WrittenQuestion, answer: string): WrittenResult {
  const raw = answer.trim();
  const norm = normalise(raw);
  const words = norm.split(' ').filter(Boolean);
  const wordSet = new Set(words);
  const checks: Check[] = [];

  for (const k of q.mustInclude ?? []) {
    checks.push({ label: `Uses "${k}"`, ok: norm.includes(stem(k)) });
  }
  for (const group of q.anyOf ?? []) {
    checks.push({ label: `Mentions one of: ${group.join(', ')}`, ok: group.some((g) => norm.includes(stem(g))) });
  }
  if (q.connectorsAnyOf?.length) {
    checks.push({ label: `Joins ideas with a connective (${q.connectorsAnyOf.join(', ')})`, ok: q.connectorsAnyOf.some((c) => wordSet.has(c)) });
  }
  if (q.minWords) {
    checks.push({ label: `At least ${q.minWords} words (you wrote ${words.length})`, ok: words.length >= q.minWords });
  }
  if (q.mustStartCapital) {
    checks.push({ label: 'Starts with a capital letter', ok: /^[A-Z]/.test(raw) });
  }
  if (q.mustEndPunctuation) {
    checks.push({ label: 'Ends with punctuation', ok: /[.!?]["')\]]?$/.test(raw) });
  }
  const passed = checks.filter((c) => c.ok).length;
  const score = checks.length ? Math.round((passed / checks.length) * 100) : 0;
  return { score, checks, pass: score >= 80 };
}
