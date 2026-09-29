import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile, StudentSubject } from '@/lib/types';
import { useUser } from '@/features/auth/AuthProvider';
import { qk, unwrap } from './client';

const PROFILE_COLUMNS =
  'id, email, username, display_name, role, program, igcse_tier, timezone, onboarded_at, leaderboard_opt_in, tutor_style, subscription, founding_member, study_minutes_per_day, study_days_per_week, xp, streak_days, longest_streak, last_study_date, created_at';

export function useProfile() {
  const user = useUser();
  return useQuery({
    queryKey: qk.profile(user.id),
    queryFn: () => unwrap<Profile>(supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).single()),
  });
}

/** Fields a student may edit (mirrors the column grants in 009 and 016). */
export type ProfileUpdate = Partial<Pick<Profile,
  'username' | 'display_name' | 'role' | 'program' | 'igcse_tier' | 'timezone' | 'onboarded_at' | 'leaderboard_opt_in' | 'tutor_style'
  | 'study_minutes_per_day' | 'study_days_per_week'>>;

export function useUpdateProfile() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfileUpdate) =>
      unwrap<Profile>(supabase.from('profiles').update(patch).eq('id', user.id).select(PROFILE_COLUMNS).single()),
    onSuccess: (p) => qc.setQueryData(qk.profile(user.id), p),
  });
}

export function useStudentSubjects() {
  const user = useUser();
  return useQuery({
    queryKey: qk.subjects(user.id),
    queryFn: () => unwrap<StudentSubject[]>(
      supabase.from('student_subjects').select('subject_key, exam_date, target_grade, confidence').eq('user_id', user.id),
    ),
  });
}

/** Replaces the student's subject list in one go. */
export function useSaveSubjects() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subjects: StudentSubject[]) => {
      const keys = subjects.map((s) => s.subject_key);
      if (subjects.length) {
        await unwrap(supabase.from('student_subjects').upsert(subjects.map((s) => ({ ...s, user_id: user.id })), { onConflict: 'user_id,subject_key' }));
      }
      let del = supabase.from('student_subjects').delete().eq('user_id', user.id);
      if (keys.length) del = del.not('subject_key', 'in', `(${keys.map((k) => `"${k}"`).join(',')})`);
      await unwrap(del);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.subjects(user.id) }),
  });
}
