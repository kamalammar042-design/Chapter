// Tutor history & memory, leaderboard, parent access, subscription.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Conversation, Leaderboard, MemoryItem, TutorMessage } from '@/lib/types';
import { useUser } from '@/features/auth/AuthProvider';
import { qk, unwrap } from './client';

// ---- tutor ------------------------------------------------------------
export function useConversations() {
  const user = useUser();
  return useQuery({
    queryKey: qk.conversations(user.id),
    queryFn: () => unwrap<Conversation[]>(
      supabase.from('tutor_conversations').select('id, title, subject_key, created_at, updated_at')
        .eq('user_id', user.id).order('updated_at', { ascending: false }).limit(100),
    ),
  });
}

export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: qk.messages(conversationId ?? ''),
    enabled: !!conversationId,
    queryFn: () => unwrap<TutorMessage[]>(
      supabase.from('tutor_messages').select('id, role, content, attachments, mode, created_at')
        .eq('conversation_id', conversationId!).order('id'),
    ),
  });
}

export function useDeleteConversation() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(supabase.from('tutor_conversations').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.conversations(user.id) }),
  });
}

export function useRenameConversation() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      unwrap(supabase.from('tutor_conversations').update({ title: title.slice(0, 120) }).eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.conversations(user.id) }),
  });
}

export async function attachmentUrls(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const { data } = await supabase.storage.from('tutor-uploads').createSignedUrls(paths, 3600);
  return (data ?? []).map((d) => d.signedUrl).filter(Boolean) as string[];
}

export function useMemory() {
  const user = useUser();
  return useQuery({
    queryKey: qk.memory(user.id),
    queryFn: () => unwrap<MemoryItem[]>(
      supabase.from('student_memory').select('id, kind, subject_key, content, source, evidence_count, updated_at')
        .eq('user_id', user.id).order('updated_at', { ascending: false }),
    ),
  });
}

export function useAddMemory() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (m: { kind: MemoryItem['kind']; content: string }) =>
      unwrap(supabase.from('student_memory').insert({ ...m, source: 'user' })),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.memory(user.id) }),
  });
}

export function useDeleteMemory() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | 'all') =>
      id === 'all'
        ? unwrap(supabase.from('student_memory').delete().eq('user_id', user.id))
        : unwrap(supabase.from('student_memory').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.memory(user.id) }),
  });
}

// ---- leaderboard -------------------------------------------------------
export function useLeaderboard() {
  const user = useUser();
  return useQuery({
    queryKey: qk.leaderboard(user.id),
    queryFn: () => unwrap<Leaderboard>(supabase.rpc('get_leaderboard', { p_limit: 30 })),
  });
}

// ---- parent access -------------------------------------------------------
export interface ParentLinks {
  parents: Array<{ parent_id: string; name: string; email_hint: string | null; linked_at: string }>;
  invite: { code: string; expires_at: string } | null;
}

export function useParentLinks() {
  const user = useUser();
  return useQuery({
    queryKey: qk.parentLinks(user.id),
    queryFn: () => unwrap<ParentLinks>(supabase.rpc('my_parent_links')),
  });
}

export function useCreateInvite() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap<{ code: string; expires_at: string }>(supabase.rpc('create_parent_invite')),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.parentLinks(user.id) }),
  });
}

export function useRemoveLink() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (otherId: string) => unwrap(supabase.rpc('remove_parent_link', { p_other: otherId })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.parentLinks(user.id) });
      qc.invalidateQueries({ queryKey: qk.students(user.id) });
    },
  });
}

export interface LinkedStudent { student_id: string; name: string; program: string | null; linked_at: string }

export function useMyStudents() {
  const user = useUser();
  return useQuery({
    queryKey: qk.students(user.id),
    queryFn: () => unwrap<LinkedStudent[]>(supabase.rpc('my_students')),
  });
}

export function useAcceptInvite() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      unwrap<{ ok: boolean; reason?: string; student_id?: string; display_name?: string }>(supabase.rpc('accept_parent_invite', { p_code: code })),
    onSuccess: (r) => {
      if (r.ok) {
        qc.invalidateQueries({ queryKey: qk.students(user.id) });
        qc.invalidateQueries({ queryKey: qk.profile(user.id) });
      }
    },
  });
}

export interface StudentOverview {
  student: {
    name: string; program: string | null; igcse_tier: string | null; timezone: string; xp: number;
    streak_days: number; longest_streak: number; last_study_date: string | null; today: string;
  };
  subjects: Array<{ subject_key: string; exam_date: string | null; target_grade: string | null }>;
  topic_stats: Array<{ subject_key: string; topic_key: string; attempts: number; correct: number; recent_score: number; last_attempt_at: string | null }>;
  /** skill-level progress (migration 015); absent from older servers */
  skills?: {
    weakest: Array<{ skill_id: string; name: string; subject_key: string; mastery: number; attempts: number }>;
    secure: number; practised: number; due_reviews: number; recurring_mistakes: number;
  };
  activity: Array<{ day: string; questions: number; correct: number; practice_seconds: number; reviews: number; xp: number }>;
  goals: Array<{ id: string; kind: string; period: string; subject_key: string | null; target: number; target_label: string | null; due_date: string | null; created_at: string }>;
  papers: Array<{ subject_key: string; title: string; score: number; max_score: number; completed_on: string }>;
}

export function useStudentOverview(studentId: string | undefined) {
  return useQuery({
    queryKey: qk.overview(studentId ?? ''),
    enabled: !!studentId,
    queryFn: () => unwrap<StudentOverview>(supabase.rpc('parent_student_overview', { p_student: studentId })),
  });
}

// ---- subscription -----------------------------------------------------------
export interface Subscription {
  tier: 'free' | 'pro' | 'parent';
  /** false while no payment system is connected: every feature is free */
  paywall_enabled?: boolean;
  /** active Chapter Plus (RevenueCat), verified on the server */
  plus?: boolean;
  plus_expires_at?: string | null;
  founding_member: boolean;
  active: Array<{ tier: string; source: string; expires_at: string | null }>;
}

export function useSubscription() {
  const user = useUser();
  return useQuery({
    queryKey: qk.subscription(user.id),
    queryFn: () => unwrap<Subscription>(supabase.rpc('my_subscription')),
  });
}
