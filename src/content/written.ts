// Short written-answer questions (graded on the device against keywords; see
// features/study/written-grading.ts). Kept apart from the MCQ bank so the
// Written page loads only what it needs.
import { WRITTEN_QUESTIONS } from './bank/written.js';
import type { Difficulty } from '@/lib/types';

export interface WrittenQuestion {
  subjectId: number;
  topic: string;
  q: string;
  prompt?: string;
  mustInclude?: string[];
  anyOf?: string[][];
  connectorsAnyOf?: string[];
  minWords?: number;
  mustStartCapital?: boolean;
  mustEndPunctuation?: boolean;
  sampleAnswer?: string;
  exp?: string;
  diff?: Difficulty;
  levels?: string[];
}

export const WRITTEN = WRITTEN_QUESTIONS as WrittenQuestion[];
