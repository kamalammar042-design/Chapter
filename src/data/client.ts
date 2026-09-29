// Shared data-access helpers.
import { QueryClient } from '@tanstack/react-query';
import { toAppError } from '@/lib/errors';

interface PgResult<T> { data: T | null; error: unknown }

/** Throws a normalised AppError when Supabase reports one. */
export async function unwrap<T>(p: PromiseLike<PgResult<T>>): Promise<T> {
  const { data, error } = await p;
  if (error) throw toAppError(error);
  return data as T;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: true,
        retry: (count, err) => {
          const code = toAppError(err).code;
          if (['forbidden', 'not_found', 'session_expired', 'invalid_request'].includes(code)) return false;
          return count < 2;
        },
        retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
      },
      mutations: { retry: false },
    },
  });
}

export const qk = {
  profile: (uid: string) => ['profile', uid] as const,
  subjects: (uid: string) => ['subjects', uid] as const,
  topicStats: (uid: string) => ['topic-stats', uid] as const,
  activity: (uid: string) => ['activity', uid] as const,
  sessions: (uid: string) => ['sessions', uid] as const,
  recentAttempts: (uid: string) => ['recent-attempts', uid] as const,
  quota: (uid: string) => ['quota', uid] as const,
  allowance: (uid: string, kind: string) => ['allowance', uid, kind] as const,
  goals: (uid: string) => ['goals', uid] as const,
  notes: (uid: string) => ['notes', uid] as const,
  note: (id: string) => ['note', id] as const,
  decks: (uid: string) => ['decks', uid] as const,
  cards: (deckId: string) => ['cards', deckId] as const,
  dueCards: (uid: string) => ['due-cards', uid] as const,
  papers: () => ['past-papers'] as const,
  paperAttempts: (uid: string) => ['paper-attempts', uid] as const,
  conversations: (uid: string) => ['conversations', uid] as const,
  messages: (cid: string) => ['messages', cid] as const,
  memory: (uid: string) => ['memory', uid] as const,
  leaderboard: (uid: string) => ['leaderboard', uid] as const,
  parentLinks: (uid: string) => ['parent-links', uid] as const,
  students: (uid: string) => ['students', uid] as const,
  overview: (sid: string) => ['overview', sid] as const,
  subscription: (uid: string) => ['subscription', uid] as const,
  skillMastery: (uid: string) => ['skill-mastery', uid] as const,
  misconceptions: (uid: string) => ['misconceptions', uid] as const,
  dueReviews: (uid: string) => ['due-reviews', uid] as const,
  resources: () => ['resources'] as const,
  admin: (...parts: string[]) => ['admin', ...parts] as const,
};
