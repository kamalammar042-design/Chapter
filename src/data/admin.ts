// Content administration. Every read and write here is authorised on the
// server: RLS policies and the admin_* functions check public.is_admin(),
// so a non-admin who calls these gets nothing or "forbidden". The client-side
// guard only decides what to render.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Resource } from '@/lib/types';
import { useUser } from '@/features/auth/AuthProvider';
import { qk, unwrap } from './client';

export function useIsAdmin() {
  const user = useUser();
  return useQuery({
    queryKey: [...qk.admin('is-admin'), user.id],
    staleTime: 5 * 60_000,
    queryFn: () => unwrap<boolean>(supabase.rpc('is_admin')),
  });
}

export type QuestionStatus = 'draft' | 'pending_review' | 'published' | 'archived' | 'rejected';

export interface AdminQuestion {
  id: string;
  subject_key: string;
  topic_key: string;
  skill_id: string | null;
  question_type: 'mcq' | 'procedural';
  template_key: string | null;
  stem: string;
  options: Array<{ text: string; misconception_id?: string | null }>;
  correct_index: number | null;
  explanation: string;
  hint: string | null;
  difficulty: number;
  tier: 'all' | 'core' | 'extended';
  tags: string[];
  source_type: string;
  source_name: string;
  source_url: string | null;
  license: string;
  copyright_status: string;
  syllabus_version: string | null;
  status: QuestionStatus;
  review_note: string | null;
  validation: { passed?: boolean; checks?: Array<{ name: string; ok: boolean; severity: string; detail?: string }>; verifier?: string } | null;
  generator: Record<string, unknown> | null;
  version: number;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  owner_id: string | null;
}

const Q_COLUMNS = 'id, subject_key, topic_key, skill_id, question_type, template_key, stem, options, correct_index, explanation, hint, difficulty, tier, tags, source_type, source_name, source_url, license, copyright_status, syllabus_version, status, review_note, validation, generator, version, created_at, updated_at, reviewed_at, owner_id';

export interface QuestionFilter {
  status: QuestionStatus | '';
  subject: string;
  source: string;
  search: string;
}

export function useAdminQuestions(f: QuestionFilter) {
  return useQuery({
    queryKey: qk.admin('questions', JSON.stringify(f)),
    queryFn: () => {
      let q = supabase.from('questions').select(Q_COLUMNS).is('owner_id', null).order('updated_at', { ascending: false }).limit(100);
      if (f.status) q = q.eq('status', f.status);
      if (f.subject) q = q.eq('subject_key', f.subject);
      if (f.source) q = q.eq('source_type', f.source);
      if (f.search.trim()) q = q.ilike('stem', `%${f.search.trim().replace(/[%_]/g, '')}%`);
      return unwrap<AdminQuestion[]>(q);
    },
  });
}

export interface QuestionStats {
  attempts: number; correct: number; total_time_ms: number; hint_uses: number; skips: number; option_counts: number[];
}

export function useQuestionStats(id: string | null) {
  return useQuery({
    queryKey: qk.admin('question-stats', id ?? ''),
    enabled: !!id,
    queryFn: async () => (await unwrap<QuestionStats[]>(supabase.from('question_stats').select('attempts, correct, total_time_ms, hint_uses, skips, option_counts').eq('question_id', id!)))[0] ?? null,
  });
}

export type QuestionPatch = Partial<Pick<AdminQuestion,
  'stem' | 'options' | 'correct_index' | 'explanation' | 'hint' | 'difficulty' | 'skill_id' | 'topic_key' | 'tier' | 'status' | 'review_note'
  | 'source_type' | 'source_name' | 'source_url' | 'license' | 'copyright_status' | 'syllabus_version'>>;

export function useSaveQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string | null; patch: QuestionPatch & { subject_key?: string } }) => {
      if (id) return unwrap<AdminQuestion>(supabase.from('questions').update(patch).eq('id', id).select(Q_COLUMNS).single());
      const hash = await sha(`${patch.subject_key}|${patch.stem}|${(patch.options ?? []).map((o) => o.text).join('|')}`);
      return unwrap<AdminQuestion>(supabase.from('questions').insert({ ...patch, question_type: 'mcq', content_hash: hash }).select(Q_COLUMNS).single());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin() }),
  });
}

async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s.toLowerCase().replace(/\s+/g, ' ').trim()));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export interface HealthRow {
  question_id: string; stem: string; subject_key: string; topic_key: string; skill_id: string | null; difficulty: number;
  status: string; source_type: string; attempts: number; accuracy: number | null; expected_accuracy: number;
  avg_time_s: number | null; hint_rate: number | null; skip_rate: number | null; option_counts: number[];
  correct_index: number | null; open_reports: number; flags: string[];
}

export function useQuestionHealth(minAttempts = 30) {
  return useQuery({
    queryKey: qk.admin('health', String(minAttempts)),
    queryFn: () => unwrap<HealthRow[]>(supabase.rpc('admin_question_health', { p_min_attempts: minAttempts, p_only_flagged: true, p_limit: 300 })),
  });
}

export interface ReportRow {
  id: string; question_id: string; reason: string; comment: string | null; created_at: string;
  question: { stem: string; status: string } | null;
}

export function useOpenReports() {
  return useQuery({
    queryKey: qk.admin('reports'),
    queryFn: async () => (await unwrap<unknown>(supabase.from('question_reports')
      .select('id, question_id, reason, comment, created_at, question:questions(stem, status)')
      .is('resolved_at', null).order('created_at', { ascending: true }).limit(200))) as ReportRow[],
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  const user = useUser();
  return useMutation({
    mutationFn: ({ id, resolution }: { id: string; resolution: string }) =>
      unwrap(supabase.from('question_reports').update({ resolved_at: new Date().toISOString(), resolved_by: user.id, resolution: resolution.slice(0, 500) }).eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin() }),
  });
}

export function useAdminResources() {
  return useQuery({
    queryKey: qk.admin('resources'),
    queryFn: () => unwrap<Resource[]>(supabase.from('resources')
      .select('id, subject_key, program, title, provider, resource_type, year, session, paper_number, variant, component, tier, access, source_type, license, external_url, storage_path, duration_minutes, max_marks, status, last_checked_at')
      .order('status').order('subject_key')),
  });
}

export function useUpdateResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<Resource, 'status' | 'title' | 'external_url'>> }) =>
      unwrap(supabase.from('resources').update(patch).eq('id', id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.admin() });
      qc.invalidateQueries({ queryKey: qk.resources() });
    },
  });
}

export interface Overview {
  questions_by_status: Record<string, number>;
  questions_by_source: Record<string, number>;
  open_reports: number;
  resources_unavailable: number;
  errors_24h: number;
  skills_without_questions: number;
}

export function useAdminOverview() {
  return useQuery({ queryKey: qk.admin('overview'), queryFn: () => unwrap<Overview>(supabase.rpc('admin_overview')) });
}

export interface AiUsage {
  since: string;
  totals: { requests: number; failures: number; input_tokens: number; output_tokens: number; estimated_cost_usd: number; avg_duration_ms: number };
  by_model: Array<{ model: string; requests: number; failures: number; estimated_cost_usd: number }>;
  by_task: Array<{ task: string; requests: number; avg_duration_ms: number; estimated_cost_usd: number }>;
  by_day: Array<{ day: string; requests: number; estimated_cost_usd: number }>;
}

export function useAiUsage(days: number) {
  return useQuery({ queryKey: qk.admin('ai-usage', String(days)), queryFn: () => unwrap<AiUsage>(supabase.rpc('admin_ai_usage', { p_days: days })) });
}

export interface GenerationRun {
  id: string; subject_key: string; topic_key: string; requested_count: number; published: number; pending_review: number;
  rejected: number; model: string | null; started_at: string; finished_at: string | null;
}

export function useGenerationRuns() {
  return useQuery({
    queryKey: qk.admin('runs'),
    queryFn: () => unwrap<GenerationRun[]>(supabase.from('content_generation_runs')
      .select('id, subject_key, topic_key, requested_count, published, pending_review, rejected, model, started_at, finished_at')
      .order('started_at', { ascending: false }).limit(50)),
  });
}

export interface AppEvent { id: number; created_at: string; level: string; source: string; event: string; route: string | null; message: string | null; app_version: string | null }

export function useAppEvents() {
  return useQuery({
    queryKey: qk.admin('events'),
    queryFn: () => unwrap<AppEvent[]>(supabase.from('app_events').select('id, created_at, level, source, event, route, message, app_version').order('created_at', { ascending: false }).limit(100)),
  });
}
