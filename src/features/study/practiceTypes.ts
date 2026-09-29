import type { PoolRow } from '@/lib/types';

/**
 * AI-generated questions handed to the practice screen via router state.
 * These are rows the server stored and published after validation, so they
 * are answered through submit_attempt like any other question.
 */
export interface GeneratedSet {
  subjectKey: string;
  topicKey: string;
  rows: PoolRow[];
}
