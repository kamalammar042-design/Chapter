// Builds the questions for a practice session from the URL parameters.
import { useEffect, useState } from 'react';
import { getSubject } from '@/content/catalog';
import { buildPracticeSet, mulberry32, type Question } from '@/content/engine';
import { fetchPool, masteryMap } from '@/data/learning';
import { supabase } from '@/lib/supabase';
import { toAppError, type AppError } from '@/lib/errors';
import type { DueReview, PoolRow, PracticeMode, Profile, SkillMasteryRow, StudentSubject } from '@/lib/types';
import type { GeneratedSet } from './practiceTypes';

export interface PracticeParams {
  mode: PracticeMode;
  subjectKey: string | null;
  topicKey: string | null;
  skillId: string | null;
  count: number;
  /** fixed difficulty band, e.g. [4, 5]; null = adaptive */
  band: [number, number] | null;
  generated: GeneratedSet | null;
}

export type EmptyReason = 'no_questions' | 'no_reviews' | 'no_subjects' | 'no_weak_skills';

export type PracticeSetState =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty'; reason: EmptyReason }
  | { status: 'ready'; questions: Question[]; pool: PoolRow[]; offline: boolean };

interface Ctx {
  userId: string;
  profile: Profile | undefined;
  subjects: StudentSubject[] | undefined;
  mastery: SkillMasteryRow[] | undefined;
}

async function dueSkills(): Promise<DueReview[]> {
  const { data, error } = await supabase.rpc('due_reviews', { p_limit: 30 });
  if (error) throw error;
  return (data ?? []) as DueReview[];
}

export function usePracticeSet(params: PracticeParams, ctx: Ctx): [PracticeSetState, () => void] {
  const [state, setState] = useState<PracticeSetState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);
  const ready = !!ctx.profile && !!ctx.subjects && !!ctx.mastery;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        const rng = mulberry32((Date.now() ^ nonce * 7919) >>> 0);
        const mastery = masteryMap(ctx.mastery);
        const chosen = (ctx.subjects ?? []).map((s) => s.subject_key);
        const scope = params.subjectKey && getSubject(params.subjectKey) ? [params.subjectKey] : chosen;
        let pool: PoolRow[] = [];
        let offline = false;
        const load = async (q: Parameters<typeof fetchPool>[1]) => {
          const r = await fetchPool(ctx.userId, q);
          offline ||= r.offline;
          pool.push(...r.rows);
        };

        if (params.generated) {
          pool = params.generated.rows;
        } else {
          if (!scope.length) {
            if (!cancelled) setState({ status: 'empty', reason: 'no_subjects' });
            return;
          }
          if (params.mode === 'review') {
            // Spaced review: skills that are due, with fresh questions on them.
            const due = (await dueSkills()).filter((d) => scope.includes(d.subject_key));
            if (!due.length) {
              if (!cancelled) setState({ status: 'empty', reason: 'no_reviews' });
              return;
            }
            const bySubject = new Map<string, string[]>();
            for (const d of due) bySubject.set(d.subject_key, [...(bySubject.get(d.subject_key) ?? []), d.skill_id]);
            for (const [subject, skills] of bySubject) await load({ subject, skills, limit: 120 });
          } else if (params.mode === 'weakness') {
            const weak = [...mastery.values()]
              .filter((m) => m.attempts >= 2 && m.mastery < 60 && scope.includes(m.skill_id.split('/')[0]))
              .sort((a, b) => a.mastery - b.mastery).slice(0, 6);
            if (!weak.length) {
              if (!cancelled) setState({ status: 'empty', reason: 'no_weak_skills' });
              return;
            }
            const bySubject = new Map<string, string[]>();
            for (const w of weak) {
              const s = w.skill_id.split('/')[0];
              bySubject.set(s, [...(bySubject.get(s) ?? []), w.skill_id]);
            }
            for (const [subject, skills] of bySubject) await load({ subject, skills, limit: 120 });
          } else if (params.skillId) {
            await load({ subject: params.skillId.split('/')[0], skills: [params.skillId], limit: 120 });
          } else {
            const perSubject = scope.length > 1 ? 50 : 150;
            for (const subject of scope) await load({ subject, topic: params.topicKey, limit: perSubject });
          }
        }

        // Guided sessions choose one question at a time from the pool.
        const questions = params.mode === 'guided'
          ? []
          : buildPracticeSet(pool, {
            count: params.count,
            mastery,
            band: params.band,
            adaptive: params.mode !== 'exam',
            rng,
          });
        if (cancelled) return;
        const empty = params.mode === 'guided' ? pool.length === 0 : questions.length === 0;
        setState(empty ? { status: 'empty', reason: 'no_questions' } : { status: 'ready', questions, pool, offline });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', error: toAppError(e) });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, nonce, params.mode, params.subjectKey, params.topicKey, params.skillId, params.count, params.band?.[0], params.band?.[1], params.generated]);

  return [state, () => setNonce((n) => n + 1)];
}
