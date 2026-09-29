// Row shapes returned by the database (see supabase/migrations).
import type { IgcseTier, ProgramKey } from '@/content/catalog';

export type Tier = 'free' | 'pro' | 'parent';
export type Role = 'student' | 'parent';
export type TutorStyle = 'balanced' | 'concise' | 'detailed' | 'socratic';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type PracticeMode = 'practice' | 'daily' | 'exam' | 'placement' | 'review' | 'reading' | 'weakness' | 'guided' | 'plan';

export interface Profile {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  role: Role;
  program: ProgramKey | null;
  igcse_tier: IgcseTier | null;
  timezone: string;
  onboarded_at: string | null;
  leaderboard_opt_in: boolean;
  tutor_style: TutorStyle;
  subscription: Tier;
  founding_member: boolean;
  study_minutes_per_day: number;
  study_days_per_week: number;
  xp: number;
  streak_days: number;
  longest_streak: number;
  last_study_date: string | null;
  created_at: string;
}

export interface StudentSubject {
  subject_key: string;
  exam_date: string | null;
  target_grade: string | null;
  confidence: number | null;
}

export interface TopicStat {
  subject_key: string;
  topic_key: string;
  attempts: number;
  correct: number;
  recent_score: number;
  last_attempt_at: string | null;
}

export interface DailyActivity {
  day: string;
  questions: number;
  correct: number;
  xp: number;
  practice_seconds: number;
  reviews: number;
}

export interface PracticeSessionRow {
  id: string;
  subject_key: string | null;
  topic_key: string | null;
  mode: PracticeMode;
  question_count: number;
  correct_count: number;
  practice_seconds: number;
  xp_earned: number;
  started_at: string;
  ended_at: string | null;
}

export type GoalKind = 'questions' | 'practice_minutes' | 'accuracy' | 'flashcards' | 'papers' | 'paper_score' | 'sat_score';

export interface Goal {
  id: string;
  kind: GoalKind;
  period: 'weekly' | 'by_date';
  subject_key: string | null;
  target: number;
  target_label: string | null;
  due_date: string | null;
  created_at: string;
  archived_at: string | null;
}

export interface Note {
  id: string;
  subject_key: string | null;
  topic_key: string | null;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface Deck {
  id: string;
  title: string;
  subject_key: string | null;
  source: 'manual' | 'ai' | 'note' | 'mistake' | 'tutor' | 'upload';
  created_at: string;
}

export interface Flashcard {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  ease: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  due_at: string;
  last_reviewed_at: string | null;
  created_at: string;
  topic_key?: string | null;
  skill_id?: string | null;
  source_kind?: 'manual' | 'ai' | 'note' | 'mistake' | 'tutor' | 'upload';
}

/** An entry in the resources directory (migration 013). */
export interface Resource {
  id: string;
  subject_key: string | null;
  program: 'igcse' | 'sat' | null;
  title: string;
  provider: string;
  resource_type: 'question_paper' | 'mark_scheme' | 'insert' | 'specimen' | 'syllabus' | 'practice_test' | 'examiner_report' | 'notes' | 'video' | 'other';
  year: number | null;
  session: 'feb_mar' | 'may_jun' | 'oct_nov' | 'specimen' | 'practice' | null;
  paper_number: number | null;
  variant: number | null;
  component: string | null;
  tier: IgcseTier | null;
  /** external: a link to the publisher; hosted/download: a file Chapter may redistribute */
  access: 'external' | 'hosted' | 'download';
  source_type: 'official_reference' | 'external_link' | 'owned' | 'licensed' | 'open_license' | 'generated';
  license: string | null;
  external_url: string | null;
  storage_path: string | null;
  duration_minutes: number | null;
  max_marks: number | null;
  status: 'active' | 'unavailable' | 'pending';
  last_checked_at: string | null;
}

export interface PaperAttempt {
  id: string;
  paper_id: string | null;
  subject_key: string;
  title: string;
  score: number;
  max_score: number;
  completed_on: string;
  duration_minutes: number | null;
  reflection: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  subject_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface TutorMessage {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  attachments: string[];
  mode: string | null;
  created_at: string;
}

export interface MemoryItem {
  id: string;
  kind: 'struggle' | 'misconception' | 'strength' | 'preference' | 'goal' | 'context';
  subject_key: string | null;
  content: string;
  source: 'tutor' | 'user';
  evidence_count: number;
  updated_at: string;
}

export interface Quota {
  unlimited: boolean;
  tier: Tier;
  used?: number;
  limit?: number;
  remaining?: number;
  resets_on?: string;
}

export interface AiAllowance {
  allowed: boolean;
  tier: Tier;
  cap: number;
  used: number;
  remaining: number;
  reason: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  xp: number;
  is_me: boolean;
}

export interface Leaderboard {
  week_start: string;
  week_end: string;
  program: ProgramKey | null;
  entries: LeaderboardEntry[];
  me: { rank: number; xp: number } | null;
  size: number;
}

// ---- Learning engine (migrations 013–016) ---------------------------------

export type SourceType = 'owned' | 'licensed' | 'open_license' | 'generated' | 'user_uploaded';

/** A question as served by get_practice_pool(). */
export interface PoolRow {
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
  cognitive_level: string;
  source_type: SourceType;
  source_name: string;
  recently_seen: boolean;
}

/** What submit_attempt() decided. */
export interface SubmitResult {
  duplicate: boolean;
  correct: boolean;
  correct_index: number | null;
  xp: number;
  skill_id: string | null;
  mastery_before?: number;
  mastery_after?: number;
  misconception?: string | null;
}

export interface SkillMasteryRow {
  skill_id: string;
  attempts: number;
  correct: number;
  hints_used: number;
  rating: number;
  mastery: number;
  recent_score: number;
  correct_streak: number;
  incorrect_streak: number;
  review_level: number;
  interval_days: number;
  next_review_at: string | null;
  first_seen_at: string;
  last_practiced_at: string | null;
}

export interface StudentMisconceptionRow {
  misconception_id: string;
  evidence_count: number;
  avoided_count: number;
  last_seen_at: string;
  resolved_at: string | null;
  misconception: { key: string; description: string; skill_id: string } | null;
}

export interface DueReview {
  skill_id: string;
  subject_key: string;
  topic_key: string;
  name: string;
  mastery: number;
  next_review_at: string;
  interval_days: number;
  incorrect_streak: number;
}
