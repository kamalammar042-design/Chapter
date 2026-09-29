// ============================================================
// Recording practice
// ------------------------------------------------------------
// Answers go to the server through submit_attempt(), which looks up the
// stored answer key and decides whether the answer was right. The client
// reports only which option was chosen (in the question's stored order).
//
// If the network is down, writes go to a small per-user outbox in
// localStorage and are replayed in order when the connection returns.
// Every answer carries a client-generated id and submit_attempt() is
// idempotent on it, so a replay can never double-count or lose an answer.
// ============================================================
import { supabase } from '@/lib/supabase';
import { AppError, toAppError } from '@/lib/errors';
import type { PracticeMode, SubmitResult } from '@/lib/types';

export interface AttemptInput {
  sessionId: string | null;
  questionId: string;
  /** chosen option in the stored order (MCQ); null for procedural questions */
  selected: number | null;
  /** procedural questions: the device-checked result of this instance */
  instance?: { correct: boolean; misconception: string | null; ref: string; text: string } | null;
  timeMs: number;
  hints: number;
  mode: PracticeMode;
}

interface SubmitArgs {
  p_client_id: string;
  p_question_id: string;
  p_selected: number | null;
  p_time_ms: number;
  p_hints: number;
  p_mode: PracticeMode;
  p_session_id: string | null;
  p_instance: AttemptInput['instance'] | null;
}

type OutboxItem =
  | { type: 'session'; row: { id: string; mode: PracticeMode; subject_key: string | null; topic_key: string | null } }
  | { type: 'submit'; args: SubmitArgs }
  | { type: 'end'; id: string; at: string };

const key = (uid: string) => `chapter.outbox.${uid}`;

function isItem(v: unknown): v is OutboxItem {
  const t = (v as { type?: string } | null)?.type;
  return t === 'session' || t === 'submit' || t === 'end';
}

function readOutbox(uid: string): OutboxItem[] {
  try {
    const raw = localStorage.getItem(key(uid));
    const v = raw ? JSON.parse(raw) : [];
    // Items written by older versions of the app (direct inserts) cannot be
    // replayed against the current server and are skipped.
    return Array.isArray(v) ? v.filter(isItem) : [];
  } catch {
    return [];
  }
}

function writeOutbox(uid: string, items: OutboxItem[]): void {
  try {
    if (items.length) localStorage.setItem(key(uid), JSON.stringify(items.slice(-500)));
    else localStorage.removeItem(key(uid));
  } catch {
    /* storage unavailable: items stay in memory for this page only */
  }
}

export function pendingCount(uid: string): number {
  return readOutbox(uid).filter((i) => i.type === 'submit').length;
}

function isNetworkError(e: unknown): boolean {
  return toAppError(e).code === 'offline';
}

async function send(item: OutboxItem): Promise<SubmitResult | null> {
  if (item.type === 'session') {
    const { error } = await supabase.from('practice_sessions').insert(item.row);
    if (error && (error as { code?: string }).code !== '23505') throw error;
    return null;
  }
  if (item.type === 'submit') {
    const { data, error } = await supabase.rpc('submit_attempt', item.args);
    if (error) throw error;
    return data as SubmitResult;
  }
  const { error } = await supabase.from('practice_sessions').update({ ended_at: item.at }).eq('id', item.id);
  if (error) throw error;
  return null;
}

type Sent = { status: 'saved'; result: SubmitResult | null } | { status: 'queued' };

/**
 * Sends an item now, or queues it when offline. Anything already queued is
 * sent first so the server sees events in order.
 */
async function sendOrQueue(uid: string, item: OutboxItem): Promise<Sent> {
  const queued = readOutbox(uid);
  if (queued.length) {
    writeOutbox(uid, [...queued, item]);
    void flushOutbox(uid);
    return { status: 'queued' };
  }
  try {
    return { status: 'saved', result: await send(item) };
  } catch (e) {
    if (isNetworkError(e)) {
      writeOutbox(uid, [...readOutbox(uid), item]);
      return { status: 'queued' };
    }
    throw toAppError(e);
  }
}

let flushing: Promise<{ sent: number; dropped: number }> | null = null;

/** Replays queued writes. Safe to call often; runs one flush at a time. */
export function flushOutbox(uid: string): Promise<{ sent: number; dropped: number }> {
  // A flush already running may have started while offline; run again once
  // it settles so this caller's view of the queue is current.
  if (flushing) return flushing.then(() => flushOutbox(uid));
  flushing = (async () => {
    let sent = 0;
    let dropped = 0;
    let items = readOutbox(uid);
    while (items.length) {
      const [head, ...rest] = items;
      try {
        await send(head);
        sent++;
      } catch (e) {
        if (isNetworkError(e)) break; // still offline; keep everything
        // The server refused this write for good (quota, validation, a
        // question that was withdrawn). It will never succeed, so drop it
        // rather than blocking the queue.
        dropped++;
      }
      items = rest;
      writeOutbox(uid, items);
    }
    return { sent, dropped };
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

export async function startSession(
  uid: string,
  opts: { mode: PracticeMode; subjectKey: string | null; topicKey: string | null },
): Promise<string> {
  const id = crypto.randomUUID();
  await sendOrQueue(uid, { type: 'session', row: { id, mode: opts.mode, subject_key: opts.subjectKey, topic_key: opts.topicKey } });
  return id;
}

export async function endSession(uid: string, id: string): Promise<void> {
  try {
    await sendOrQueue(uid, { type: 'end', id, at: new Date().toISOString() });
  } catch {
    /* ending a session is best-effort; counters are already on the server */
  }
}

export type RecordOutcome = { status: 'saved'; result: SubmitResult } | { status: 'queued' };

/**
 * Records one answer. Resolves with the server's verdict, or 'queued' when
 * offline. Rejects with an AppError for `free_limit_reached` or
 * `rate_limited`, which the UI must handle.
 */
export async function recordAttempt(uid: string, a: AttemptInput): Promise<RecordOutcome> {
  const args: SubmitArgs = {
    p_client_id: crypto.randomUUID(),
    p_question_id: a.questionId,
    p_selected: a.selected,
    p_time_ms: Math.max(0, Math.min(3_600_000, Math.round(a.timeMs))),
    p_hints: Math.max(0, Math.min(5, Math.round(a.hints))),
    p_mode: a.mode,
    p_session_id: a.sessionId,
    p_instance: a.instance
      ? { correct: a.instance.correct, misconception: a.instance.misconception, ref: a.instance.ref.slice(0, 200), text: a.instance.text.slice(0, 1200) }
      : null,
  };
  try {
    const r = await sendOrQueue(uid, { type: 'submit', args });
    if (r.status === 'queued' || !r.result) return { status: 'queued' };
    return { status: 'saved', result: r.result };
  } catch (e) {
    const err = toAppError(e);
    if (err.code === 'free_limit_reached' || err.code === 'rate_limited') throw err;
    throw new AppError(err.code, err.message, e);
  }
}

/** Tells the quality loop a question was shown and skipped. Best-effort. */
export async function recordSkip(questionId: string): Promise<void> {
  try {
    await supabase.rpc('record_skip', { p_question_id: questionId });
  } catch {
    /* analytics only */
  }
}

export type ReportReason = 'wrong_answer' | 'unclear' | 'typo' | 'off_syllabus' | 'other';

/** "Report a problem" with a question. One open report per question per student. */
export async function reportQuestion(questionId: string, reason: ReportReason, comment: string): Promise<void> {
  const { error } = await supabase.from('question_reports').insert({
    question_id: questionId, reason, comment: comment.trim().slice(0, 500) || null,
  });
  if (error && (error as { code?: string }).code !== '23505') throw toAppError(error);
}
