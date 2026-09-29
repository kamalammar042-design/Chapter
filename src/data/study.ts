// Goals, notes, flashcards and the resources directory.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Deck, Flashcard, Goal, GoalKind, Note, PaperAttempt, Resource } from '@/lib/types';
import { useUser } from '@/features/auth/AuthProvider';
import { qk, unwrap } from './client';
import { dedupeCards } from '@/lib/cards';

// ---- goals -----------------------------------------------------------
export function useGoals() {
  const user = useUser();
  return useQuery({
    queryKey: qk.goals(user.id),
    queryFn: () => unwrap<Goal[]>(
      supabase.from('goals').select('*').eq('user_id', user.id).is('archived_at', null).order('created_at', { ascending: false }),
    ),
  });
}

export interface GoalInput {
  kind: GoalKind;
  period: 'weekly' | 'by_date';
  target: number;
  subject_key: string | null;
  target_label: string | null;
  due_date: string | null;
}

export function useCreateGoal() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (g: GoalInput) => unwrap(supabase.from('goals').insert(g)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.goals(user.id) }),
  });
}

export function useArchiveGoal() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(supabase.from('goals').update({ archived_at: new Date().toISOString() }).eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.goals(user.id) }),
  });
}

// ---- notes -----------------------------------------------------------
export function useNotes() {
  const user = useUser();
  return useQuery({
    queryKey: qk.notes(user.id),
    queryFn: () => unwrap<Note[]>(
      supabase.from('notes').select('id, subject_key, topic_key, title, body, created_at, updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }),
    ),
  });
}

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: qk.note(id ?? ''),
    enabled: !!id,
    queryFn: () => unwrap<Note>(supabase.from('notes').select('*').eq('id', id!).single()),
  });
}

export function useCreateNote() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (n: { title: string; body: string; subject_key: string | null; topic_key?: string | null }) =>
      unwrap<Note>(supabase.from('notes').insert(n).select('*').single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notes(user.id) }),
  });
}

export function useUpdateNote() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; title?: string; body?: string; subject_key?: string | null; topic_key?: string | null }) =>
      unwrap<Note>(supabase.from('notes').update(patch).eq('id', id).select('*').single()),
    onSuccess: (n) => {
      qc.setQueryData(qk.note(n.id), n);
      qc.invalidateQueries({ queryKey: qk.notes(user.id) });
    },
  });
}

export function useDeleteNote() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(supabase.from('notes').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notes(user.id) }),
  });
}

// ---- flashcards ---------------------------------------------------------
export interface DeckWithCounts extends Deck { total: number; due: number }

export function useDecks() {
  const user = useUser();
  return useQuery({
    queryKey: qk.decks(user.id),
    queryFn: async () => {
      const [decks, cards] = await Promise.all([
        unwrap<Deck[]>(supabase.from('flashcard_decks').select('*').eq('user_id', user.id).order('created_at', { ascending: false })),
        unwrap<Array<{ deck_id: string; due_at: string }>>(supabase.from('flashcards').select('deck_id, due_at').eq('user_id', user.id)),
      ]);
      const now = Date.now();
      return decks.map<DeckWithCounts>((d) => {
        const mine = cards.filter((c) => c.deck_id === d.id);
        return { ...d, total: mine.length, due: mine.filter((c) => Date.parse(c.due_at) <= now).length };
      });
    },
  });
}

export function useDeckCards(deckId: string | undefined) {
  return useQuery({
    queryKey: qk.cards(deckId ?? ''),
    enabled: !!deckId,
    queryFn: () => unwrap<Flashcard[]>(supabase.from('flashcards').select('*').eq('deck_id', deckId!).order('created_at')),
  });
}

export function useDueCards(deckId?: string) {
  const user = useUser();
  return useQuery({
    queryKey: [...qk.dueCards(user.id), deckId ?? 'all'],
    queryFn: () => {
      let q = supabase.from('flashcards').select('*').eq('user_id', user.id).lte('due_at', new Date().toISOString()).order('due_at').limit(100);
      if (deckId) q = q.eq('deck_id', deckId);
      return unwrap<Flashcard[]>(q);
    },
  });
}

export function useCreateDeck() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { title: string; subject_key: string | null; source: Deck['source']; cards?: NewCard[] }) => {
      const deck = await unwrap<Deck>(supabase.from('flashcard_decks').insert({ title: d.title, subject_key: d.subject_key, source: d.source }).select('*').single());
      if (d.cards?.length) {
        const { kept } = dedupeCards(d.cards);
        await unwrap(supabase.rpc('add_flashcards', { p_deck: deck.id, p_cards: kept.slice(0, 100).map((c) => ({ ...c, source_kind: c.source_kind ?? d.source })) }));
      }
      return deck;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.decks(user.id) }),
  });
}

export interface NewCard {
  front: string;
  back: string;
  topic_key?: string | null;
  skill_id?: string | null;
  difficulty?: number | null;
  source_kind?: 'manual' | 'ai' | 'note' | 'mistake' | 'tutor' | 'upload';
}

/**
 * Adds cards to the student's deck with this title (creating it if needed).
 * The server skips any card whose front already exists in the deck.
 */
export async function addCardsToDeck(d: { title: string; subject_key: string | null; source: Deck['source']; cards: NewCard[] }): Promise<{ deck: Deck; added: number; skipped: number }> {
  let q = supabase.from('flashcard_decks').select('*').eq('title', d.title).limit(1);
  q = d.subject_key ? q.eq('subject_key', d.subject_key) : q.is('subject_key', null);
  const [existing] = await unwrap<Deck[]>(q);
  const deck = existing ?? await unwrap<Deck>(
    supabase.from('flashcard_decks').insert({ title: d.title, subject_key: d.subject_key, source: d.source }).select('*').single());
  const existing2 = await unwrap<Array<{ front: string }>>(supabase.from('flashcards').select('front').eq('deck_id', deck.id).limit(2000));
  const { kept, dropped } = dedupeCards(d.cards, existing2.map((c) => c.front));
  if (!kept.length) return { deck, added: 0, skipped: dropped };
  const r = await unwrap<{ added: number; skipped: number }>(supabase.rpc('add_flashcards', { p_deck: deck.id, p_cards: kept.slice(0, 100) }));
  return { deck, added: r.added, skipped: r.skipped + dropped };
}

export function useAddCards() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addCardsToDeck,
    onSuccess: ({ deck }) => {
      qc.invalidateQueries({ queryKey: qk.decks(user.id) });
      qc.invalidateQueries({ queryKey: qk.cards(deck.id) });
      qc.invalidateQueries({ queryKey: qk.dueCards(user.id) });
    },
  });
}

export function useDeleteDeck() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(supabase.from('flashcard_decks').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.decks(user.id) }),
  });
}

export function useSaveCard() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: { id?: string; deck_id: string; front: string; back: string }) =>
      c.id
        ? unwrap(supabase.from('flashcards').update({ front: c.front, back: c.back }).eq('id', c.id))
        : unwrap(supabase.from('flashcards').insert({ deck_id: c.deck_id, front: c.front, back: c.back })),
    onSuccess: (_d, c) => {
      qc.invalidateQueries({ queryKey: qk.cards(c.deck_id) });
      qc.invalidateQueries({ queryKey: qk.decks(user.id) });
    },
  });
}

export function useDeleteCard() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: { id: string; deck_id: string }) => unwrap(supabase.from('flashcards').delete().eq('id', c.id)),
    onSuccess: (_d, c) => {
      qc.invalidateQueries({ queryKey: qk.cards(c.deck_id) });
      qc.invalidateQueries({ queryKey: qk.decks(user.id) });
    },
  });
}

/** grade: 0 again · 1 hard · 2 good · 3 easy. Scheduling happens on the server. */
export function reviewCard(cardId: string, grade: 0 | 1 | 2 | 3): Promise<Flashcard> {
  return unwrap<Flashcard>(supabase.rpc('review_flashcard', { p_card: cardId, p_grade: grade }));
}

// ---- resources (past papers, official sources) ----------------------------
export function useResources() {
  return useQuery({
    queryKey: qk.resources(),
    staleTime: 10 * 60_000,
    queryFn: () => unwrap<Resource[]>(
      supabase.from('resources')
        .select('id, subject_key, program, title, provider, resource_type, year, session, paper_number, variant, component, tier, access, source_type, license, external_url, storage_path, duration_minutes, max_marks, status, last_checked_at')
        .order('year', { ascending: false, nullsFirst: true }).order('paper_number'),
    ),
  });
}

/**
 * Where to send the student for a resource. Hosted files get a short-lived
 * signed URL (the storage policy only allows active, redistributable rows);
 * external links must be https.
 */
export async function resourceUrl(r: Resource): Promise<string> {
  if (r.access !== 'external' && r.storage_path) {
    const { data, error } = await supabase.storage.from('past-papers')
      .createSignedUrl(r.storage_path, 60 * 30, r.access === 'download' ? { download: true } : undefined);
    if (error || !data) throw error ?? new Error('no url');
    return data.signedUrl;
  }
  if (r.external_url && /^https:\/\//.test(r.external_url)) return r.external_url;
  throw new Error('resource has no link');
}

export function usePaperAttempts() {
  const user = useUser();
  return useQuery({
    queryKey: qk.paperAttempts(user.id),
    queryFn: () => unwrap<PaperAttempt[]>(
      supabase.from('paper_attempts').select('*').eq('user_id', user.id).order('completed_on', { ascending: false }).order('created_at', { ascending: false }),
    ),
  });
}

export function useLogPaperAttempt() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: Omit<PaperAttempt, 'id' | 'created_at'>) => unwrap(supabase.from('paper_attempts').insert(a)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.paperAttempts(user.id) }),
  });
}

export function useDeletePaperAttempt() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(supabase.from('paper_attempts').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.paperAttempts(user.id) }),
  });
}
