import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AiAllowance, DailyActivity, PracticeSessionRow, Quota, TopicStat } from '@/lib/types';
import { useUser } from '@/features/auth/AuthProvider';
import { qk, unwrap } from './client';
import type { AttemptLite } from '@/lib/reports';

export function useTopicStats() {
  const user = useUser();
  return useQuery({
    queryKey: qk.topicStats(user.id),
    queryFn: () => unwrap<TopicStat[]>(
      supabase.from('topic_stats').select('subject_key, topic_key, attempts, correct, recent_score, last_attempt_at').eq('user_id', user.id),
    ),
  });
}

/** Daily activity for roughly the last 13 months. */
export function useActivity() {
  const user = useUser();
  return useQuery({
    queryKey: qk.activity(user.id),
    queryFn: () => {
      const since = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
      return unwrap<DailyActivity[]>(
        supabase.from('daily_activity').select('day, questions, correct, xp, practice_seconds, reviews')
          .eq('user_id', user.id).gte('day', since).order('day'),
      );
    },
  });
}

export function useRecentSessions(limit = 8) {
  const user = useUser();
  return useQuery({
    queryKey: [...qk.sessions(user.id), limit],
    queryFn: () => unwrap<PracticeSessionRow[]>(
      supabase.from('practice_sessions').select('*').eq('user_id', user.id).gt('question_count', 0)
        .order('started_at', { ascending: false }).limit(limit),
    ),
  });
}

/** Attempts from the last 15 days (for weekly reports). */
export function useRecentAttempts() {
  const user = useUser();
  return useQuery({
    queryKey: qk.recentAttempts(user.id),
    queryFn: () => {
      const since = new Date(Date.now() - 15 * 86_400_000).toISOString();
      return unwrap<AttemptLite[]>(
        supabase.from('question_attempts').select('subject_key, topic_key, correct, created_at')
          .eq('user_id', user.id).gte('created_at', since).order('created_at', { ascending: false }).limit(5000),
      );
    },
  });
}

export function useQuota() {
  const user = useUser();
  return useQuery({
    queryKey: qk.quota(user.id),
    queryFn: () => unwrap<Quota>(supabase.rpc('quota_status')),
  });
}

export function useAiAllowance(kind: 'tutor_message' | 'generate') {
  const user = useUser();
  return useQuery({
    queryKey: qk.allowance(user.id, kind),
    queryFn: () => unwrap<AiAllowance>(supabase.rpc('my_ai_allowance', { p_kind: kind })),
  });
}
