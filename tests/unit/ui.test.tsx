import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { ToastProvider } from '@/components/ui/Toast';
import { AppError } from '@/lib/errors';
import type { Question } from '@/content/engine';
import type { PoolRow } from '@/lib/types';

// ---- shared mocks -----------------------------------------------------------------
const signInWithPassword = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

vi.mock('@/features/auth/AuthProvider', () => ({
  useUser: () => ({ id: 'user-1', email: 's@example.com' }),
  useAuth: () => ({ user: null, loading: false, session: null, recovery: false, lastEvent: null, signOut: async () => {} }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

// A plain function rather than vi.fn(): Vitest's mock result tracking
// attaches its own handler to returned promises, which reports a rejection
// the component handles correctly as "unhandled".
const recordCalls: unknown[][] = [];
const reports: unknown[][] = [];
type Verdict = { correct: boolean; correct_index: number; xp: number; mastery_before?: number; mastery_after?: number; misconception?: string | null };
let recordImpl: (uid: unknown, a: { questionId: string; selected: number | null }) => Promise<unknown> = async (_u, a) => {
  const q = QUESTIONS.find((x) => x.questionId === a.questionId)!;
  const correct = a.selected === q.order[q.correct];
  const v: Verdict = { correct, correct_index: q.order[q.correct], xp: correct ? 20 : 0, mastery_before: 10, mastery_after: correct ? 14 : 8, misconception: correct ? null : 'Confuses resistance with potential difference.' };
  return { status: 'saved', result: { duplicate: false, skill_id: q.skillId, ...v } };
};
vi.mock('@/data/attempts', () => ({
  recordAttempt: (...a: unknown[]) => { recordCalls.push(a); return recordImpl(a[0], a[1] as { questionId: string; selected: number | null }); },
  recordSkip: vi.fn(async () => {}),
  reportQuestion: async (...a: unknown[]) => { reports.push(a); },
  startSession: vi.fn(async () => 'session-1'),
  endSession: vi.fn(async () => {}),
  flushOutbox: vi.fn(async () => ({ sent: 0, dropped: 0 })),
}));

function question(over: Partial<Question>): Question {
  return {
    ref: 'q', questionId: 'q', kind: 'mcq', templateKey: null, subjectKey: 'igcse.physics', topicKey: 'electricity',
    skillId: 'igcse.physics/electricity/resistance', q: '?', options: ['a', 'b', 'c', 'd'], correct: 0, order: [0, 1, 2, 3],
    misconceptions: [null, null, null, null], exp: '', hint: null, difficulty: 2, source: 'owned', sourceName: 'Chapter', recentlySeen: false, ...over,
  };
}

const QUESTIONS: Question[] = [
  // displayed order differs from stored order: the client must send the stored index
  question({ ref: 'q1', questionId: 'q1', q: 'What is the unit of resistance?', options: ['Volt', 'Ohm', 'Amp', 'Watt'], correct: 1, order: [2, 0, 1, 3], exp: 'Resistance is measured in ohms (Ω).', hint: 'Named after a German physicist.' }),
  question({ ref: 'q2', questionId: 'q2', topicKey: 'waves', skillId: 'igcse.physics/waves/wave-properties', q: 'Speed of a 50 Hz, 4 m wave?', options: ['200 m/s', '12.5 m/s', '54 m/s', '46 m/s'], correct: 0, exp: 'v = fλ = 200 m/s.', difficulty: 3 }),
];
let POOL: PoolRow[] = [];
vi.mock('@/features/study/usePracticeSet', () => ({
  usePracticeSet: () => [{ status: 'ready', questions: POOL.length ? [] : QUESTIONS, pool: POOL, offline: false }, () => {}],
}));
vi.mock('@/data/learning', () => ({
  useSkillMastery: () => ({ data: [] }),
  masteryMap: () => new Map(),
}));
vi.mock('@/data/study', () => ({ addCardsToDeck: vi.fn(async () => ({ added: 1, skipped: 0 })) }));
vi.mock('@/data/profile', () => ({
  useProfile: () => ({ data: { igcse_tier: 'extended', timezone: 'UTC' } }),
  useStudentSubjects: () => ({ data: [{ subject_key: 'igcse.physics' }] }),
}));
vi.mock('@/data/progress', () => ({ useTopicStats: () => ({ data: [] }) }));

function wrap(ui: ReactNode, path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

// ---- dialog -----------------------------------------------------------------------
function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Delete note?" description="This cannot be undone."
        footer={<><button onClick={() => setOpen(false)}>Cancel</button><button>Delete</button></>} />
    </>
  );
}

describe('Dialog', () => {
  it('is labelled, traps focus, closes on Escape and restores focus', async () => {
    const user = userEvent.setup();
    wrap(<DialogHarness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Delete note?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.tab();
    await user.tab();
    await user.tab(); // wraps from the last button back to the first
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

// ---- sign in ------------------------------------------------------------------------
describe('Sign in', () => {
  beforeEach(() => signInWithPassword.mockReset());

  it('validates input and shows a generic error for bad credentials', async () => {
    const { default: SignIn } = await import('@/features/auth/SignIn');
    const user = userEvent.setup();
    wrap(<Routes><Route path="/signin" element={<SignIn />} /></Routes>, '/signin');

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email and password.')).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();

    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials', code: 'invalid_credentials' } });
    await user.type(screen.getByLabelText('Email'), 'sam@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrongpass1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('That email and password combination is not right.')).toBeInTheDocument();
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'sam@example.com', password: 'wrongpass1' });
  });

  it('can reveal the password for checking', async () => {
    const { default: SignIn } = await import('@/features/auth/SignIn');
    const user = userEvent.setup();
    wrap(<Routes><Route path="/signin" element={<SignIn />} /></Routes>, '/signin');
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
  });
});

// ---- practice session -------------------------------------------------------------------
describe('Practice session', () => {
  const defaultImpl = recordImpl;
  beforeEach(() => { recordCalls.length = 0; reports.length = 0; recordImpl = defaultImpl; POOL = []; });

  async function renderPractice() {
    const { default: Practice } = await import('@/features/study/Practice');
    return wrap(<Routes><Route path="/practice" element={<Practice />} /></Routes>, '/practice?subject=igcse.physics&mode=practice&count=2');
  }

  it('records each answer, gives feedback and summarises the session', async () => {
    const user = userEvent.setup();
    await renderPractice();
    expect(screen.getByRole('heading', { name: 'What is the unit of resistance?' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Volt/ }));
    expect(await screen.findByText(/Not quite. The answer is B/)).toBeInTheDocument();
    expect(screen.getByText('Resistance is measured in ohms (Ω).')).toBeInTheDocument();
    for (const b of screen.getAllByRole('button', { name: /Volt|Ohm|Amp|Watt/ })) expect(b).toBeDisabled();
    await waitFor(() => expect(recordCalls).toHaveLength(1));
    // "Volt" is displayed first but stored at index 2; correctness is not sent
    expect(recordCalls[0][1]).toMatchObject({ sessionId: 'session-1', questionId: 'q1', selected: 2, hints: 0, instance: null });
    expect(recordCalls[0][1]).not.toHaveProperty('correct');
    expect(await screen.findByText(/Confuses resistance with potential difference/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next question' }));
    // keyboard shortcut: A answers the first option
    await user.keyboard('a');
    expect(await screen.findByText('Correct')).toBeInTheDocument();
    expect(screen.getByText('+20 XP')).toBeInTheDocument();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: 'Solid effort' })).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('+20 XP')).toBeInTheDocument();
    expect(screen.getByText('Questions to learn from')).toBeInTheDocument();
    // skill-level summary from the server's mastery numbers, and a next step
    expect(screen.getByText('Skills practised')).toBeInTheDocument();
    expect(screen.getByLabelText('Mastery 10% to 8%')).toBeInTheDocument();
    expect(screen.getByLabelText('Mastery 10% to 14%')).toBeInTheDocument();
    expect(screen.getByText('Patterns in your mistakes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Guided practice on this skill' })).toHaveAttribute('href', expect.stringContaining('mode=guided'));
    expect(screen.getByRole('button', { name: 'Turn into flashcards' })).toBeInTheDocument();
  });

  it('shows a hint on request and records that a hint was used', async () => {
    const user = userEvent.setup();
    await renderPractice();
    await user.click(screen.getByRole('button', { name: 'Show a hint' }));
    expect(screen.getByRole('note')).toHaveTextContent('Named after a German physicist.');
    await user.click(screen.getByRole('button', { name: /Ohm/ }));
    await waitFor(() => expect(recordCalls).toHaveLength(1));
    expect(recordCalls[0][1]).toMatchObject({ questionId: 'q1', selected: 0, hints: 1 });
    expect(await screen.findByText('+20 XP')).toBeInTheDocument();
  });

  it('lets a student report a problem with a question', async () => {
    const user = userEvent.setup();
    await renderPractice();
    await user.click(screen.getByRole('button', { name: /Ohm/ }));
    await user.click(await screen.findByRole('button', { name: /Report a problem/ }));
    const dialog = screen.getByRole('dialog', { name: 'Report a problem' });
    await user.selectOptions(within(dialog).getByLabelText('What is wrong?'), 'unclear');
    await user.type(within(dialog).getByLabelText(/Details/), 'Units are ambiguous');
    await user.click(within(dialog).getByRole('button', { name: 'Send report' }));
    await waitFor(() => expect(reports).toEqual([['q1', 'unclear', 'Units are ambiguous']]));
  });

  it('trusts the server when it disagrees with the local answer key', async () => {
    recordImpl = async () => ({ status: 'saved', result: { duplicate: false, correct: false, correct_index: 3, xp: 0, skill_id: null } });
    const user = userEvent.setup();
    await renderPractice();
    await user.click(screen.getByRole('button', { name: /Ohm/ }));
    expect(await screen.findByText(/Not quite. The answer is D/)).toBeInTheDocument();
  });

  it('runs guided practice: after a mistake it explains the idea before a different question', async () => {
    const row = (i: number, d: number): PoolRow => ({
      id: `g${i}`, subject_key: 'igcse.physics', topic_key: 'electricity', skill_id: 'igcse.physics/electricity/resistance', question_type: 'mcq',
      template_key: null, stem: `Guided question ${i}?`, options: [{ text: `right ${i}` }, { text: `wrong ${i}a` }, { text: `wrong ${i}b` }], correct_index: 0,
      explanation: `Explanation ${i}.`, hint: null, difficulty: d, cognitive_level: 'apply', source_type: 'owned', source_name: 'Chapter', recently_seen: false,
    });
    POOL = [row(1, 2), row(2, 2), row(3, 1), row(4, 1), row(5, 3), row(6, 3)];
    recordImpl = async (_u, a) => ({ status: 'saved', result: { duplicate: false, correct: a.selected === 0, correct_index: 0, xp: 5, skill_id: 'igcse.physics/electricity/resistance' } });
    const { default: Practice } = await import('@/features/study/Practice');
    const user = userEvent.setup();
    wrap(<Routes><Route path="/practice" element={<Practice />} /></Routes>, '/practice?mode=guided&skill=igcse.physics/electricity/resistance');
    expect(screen.getByText('Finding your level')).toBeInTheDocument();
    // two probes, both wrong, then the concept card
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getAllByRole('button', { name: /wrong/ })[0]);
      await user.click(await screen.findByRole('button', { name: 'Next question' }));
    }
    const card = await screen.findByRole('dialog', { name: /The idea: / });
    expect(card).toHaveTextContent('Next comes a different question on the same skill');
    await user.click(within(card).getByRole('button', { name: 'Try another question' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Guided question \d\?/);
    expect(new Set(recordCalls.map((c) => (c[1] as { questionId: string }).questionId)).size).toBe(2);
  });

  it('stops at the question limit without counting the unrecorded answer', async () => {
    recordImpl = async () => { throw new AppError('free_limit_reached'); };
    const user = userEvent.setup();
    await renderPractice();
    await user.click(screen.getByRole('button', { name: /Ohm/ }));
    expect(await screen.findByText("You've reached this month's question limit")).toBeInTheDocument();
    expect(screen.getByText(/That answer wasn't recorded/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next question' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Your allowance' })).toHaveAttribute('href', '/settings/usage');
  });
});
