// Normalises the bundled question sources into one section map. Since the
// content system (migration 013) the app serves questions from the database;
// this module is the input to scripts/generate-content-sql.ts and is not
// shipped to students.
import { QUESTION_BANK } from './core.js';
import { EXTRA_BANK } from './extra.js';
import { IGCSE_BANK } from './igcse.js';
import { SAT_BANK } from './sat.js';
import { PASSAGES } from './passages.js';
import type { Difficulty } from '@/lib/types';

export interface RawQuestion {
  q: string;
  options: string[];
  correct: number;
  exp?: string;
  diff?: Difficulty;
  levels?: string[];
}

type Nested = Record<string, Record<string, RawQuestion[]>>;

function flatten(nested: Nested): Record<string, RawQuestion[]> {
  const out: Record<string, RawQuestion[]> = {};
  for (const [subject, topics] of Object.entries(nested)) {
    for (const [topic, qs] of Object.entries(topics)) out[`${subject}>${topic}`] = qs;
  }
  return out;
}

/** Questions inherited from the original Chapter app (Whitespace Studio). */
export const LEGACY_SECTIONS: Record<string, RawQuestion[]> = {
  ...flatten(QUESTION_BANK as Nested),
  ...flatten(EXTRA_BANK as Nested),
};
/** Questions written for Chapter during the 2026 rebuild. */
export const ORIGINAL_SECTIONS: Record<string, RawQuestion[]> = {
  ...(IGCSE_BANK as Record<string, RawQuestion[]>),
  ...(SAT_BANK as Record<string, RawQuestion[]>),
};

export const SECTIONS: Record<string, RawQuestion[]> = { ...LEGACY_SECTIONS };
for (const [key, qs] of Object.entries(ORIGINAL_SECTIONS)) {
  SECTIONS[key] = [...(SECTIONS[key] ?? []), ...qs];
}

export interface Passage {
  id: string;
  title: string;
  level: string;
  text: string;
  questions: RawQuestion[];
}

export const READING_PASSAGES = PASSAGES as Passage[];
