// Learning-engine data: the practice pool, skill mastery, misconceptions and
// spaced review. All of it is computed on the server; these are read paths.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toAppError } from '@/lib/errors';
import type { DueReview, PoolRow, SkillMasteryRow, StudentMisconceptionRow } from '@/lib/types';
import { useUser } from '@/features/auth/AuthProvider';
import { qk, unwrap } from './client';

export interface PoolQuery {
  subject: string;
  topic?: string | null;
  skills?: string[] | null;
  minDiff?: number;
  maxDiff?: number;
  limit?: number;
}

const cacheKey = (uid: string, q: PoolQuery) =>
  `chapter.pool.${uid}.${q.subject}.${q.topic ?? '*'}.${(q.skills ?? []).join(',') || '*'}`;
const CACHE_MAX_AGE = 14 * 86_400_000;

function readCache(uid: string, q: PoolQuery): PoolRow[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(uid, q));
    if (!raw) return null;
    const v = JSON.parse(raw) as { at: number; rows: PoolRow[] };
    if (!Array.isArray(v.rows) || Date.now() - v.at > CACHE_MAX_AGE) return null;
    return v.rows;
  } catch {
    return null;
  }
}

function writeCache(uid: string, q: PoolQuery, rows: PoolRow[]): void {
  try {
    localStorage.setItem(cacheKey(uid, q), JSON.stringify({ at: Date.now(), rows }));
  } catch {
    /* storage full or blocked: practice still works online */
  }
}

/**
 * Published questions for a practice set. The last pool for each scope is
 * kept on the device so a session can start without a connection; answers
 * given offline are queued (see attempts.ts).
 */
export async function fetchPool(uid: string, q: PoolQuery): Promise<{ rows: PoolRow[]; offline: boolean }> {
  try {
    const rows = await unwrap<PoolRow[]>(supabase.rpc('get_practice_pool', {
      p_subject: q.subject,
      p_topic: q.topic ?? null,
      p_skills: q.skills?.length ? q.skills : null,
      p_min_diff: q.minDiff ?? 1,
      p_max_diff: q.maxDiff ?? 5,
      p_limit: q.limit ?? 80,
    }));
    writeCache(uid, q, rows);
    return { rows, offline: false };
  } catch (e) {
    if (toAppError(e).code === 'offline') {
      const cached = readCache(uid, q);
      if (cached) return { rows: cached.map((r) => ({ ...r, recently_seen: false })), offline: true };
    }
    throw e;
  }
}

export function useSkillMastery() {
  const user = useUser();
  return useQuery({
    queryKey: qk.skillMastery(user.id),
    queryFn: () => unwrap<SkillMasteryRow[]>(
      supabase.from('skill_mastery')
        .select('skill_id, attempts, correct, hints_used, rating, mastery, recent_score, correct_streak, incorrect_streak, review_level, interval_days, next_review_at, first_seen_at, last_practiced_at')
        .eq('user_id', user.id),
    ),
  });
}

export function useMisconceptions() {
  const user = useUser();
  return useQuery({
    queryKey: qk.misconceptions(user.id),
    queryFn: async () => (await unwrap<unknown>(
      supabase.from('student_misconceptions')
        .select('misconception_id, evidence_count, avoided_count, last_seen_at, resolved_at, misconception:misconceptions(key, description, skill_id)')
        .eq('user_id', user.id).order('last_seen_at', { ascending: false }).limit(50),
    )) as StudentMisconceptionRow[],
  });
}

export function useDueReviews() {
  const user = useUser();
  return useQuery({
    queryKey: qk.dueReviews(user.id),
    queryFn: () => unwrap<DueReview[]>(supabase.rpc('due_reviews', { p_limit: 30 })),
  });
}

export function masteryMap(rows: SkillMasteryRow[] | undefined): Map<string, SkillMasteryRow> {
  return new Map((rows ?? []).map((r) => [r.skill_id, r]));
}
