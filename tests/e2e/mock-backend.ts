// ============================================================
// Mock Supabase for browser tests
// ------------------------------------------------------------
// Intercepts every request the app makes to Supabase (auth, REST, RPC,
// storage, Edge Functions) and answers with realistic fixture data, so the
// real production bundle can be driven end to end without a backend.
// ============================================================
import type { Page, Route } from '@playwright/test';

export const MOCK_URL = 'https://mock-project.supabase.co';
const USER_ID = '11111111-1111-4111-8111-111111111111';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const iso = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();

export interface MockOptions {
  onboarded?: boolean;
  role?: 'student' | 'parent';
  empty?: boolean;
  tier?: 'free' | 'pro' | 'parent';
  admin?: boolean;
}

// Practice pool served by get_practice_pool. Test fixtures only.
const q = (id: string, skill: string, difficulty: number, stem: string, options: string[], correct: number, explanation: string, hint: string | null = null) => ({
  id, subject_key: 'igcse.physics', topic_key: skill.split('/')[1], skill_id: skill, question_type: 'mcq', template_key: null,
  stem, options: options.map((text) => ({ text })), correct_index: correct, explanation, hint, difficulty, cognitive_level: 'apply',
  source_type: 'owned', source_name: 'Chapter original questions (2026)', recently_seen: false,
});
const R = 'igcse.physics/electricity/resistance';
const C = 'igcse.physics/electricity/circuits';
const W = 'igcse.physics/waves/wave-properties';
export const POOL = [
  q('q-1', R, 2, 'What is the unit of electrical resistance?', ['Volt', 'Ohm', 'Ampere', 'Watt'], 1, 'Resistance is measured in ohms (Ω).', 'It is named after a German physicist.'),
  q('q-2', R, 2, 'A 12 V supply drives 3 A through a resistor. What is its resistance?', ['4 Ω', '36 Ω', '0.25 Ω', '15 Ω'], 0, 'R = V / I = 12 ÷ 3 = 4 Ω.'),
  q('q-3', C, 3, 'Two 6 Ω resistors are connected in parallel. What is the combined resistance?', ['12 Ω', '3 Ω', '6 Ω', '36 Ω'], 1, 'For equal resistors in parallel, R = 6 ÷ 2 = 3 Ω.'),
  q('q-4', C, 1, 'In a series circuit, how does the current compare at different points?', ['It is the same everywhere', 'It is largest near the cell', 'It decreases after each component', 'It is zero between components'], 0, 'Charge is not used up, so the current is the same at every point in a series circuit.'),
  q('q-5', W, 2, 'A wave has frequency 50 Hz and wavelength 4 m. What is its speed?', ['12.5 m/s', '200 m/s', '54 m/s', '46 m/s'], 1, 'v = fλ = 50 × 4 = 200 m/s.'),
  q('q-6', W, 3, 'What happens to the wavelength of a wave if its frequency doubles and its speed stays the same?', ['It doubles', 'It halves', 'It stays the same', 'It quadruples'], 1, 'v = fλ, so with v fixed, doubling f halves λ.'),
  q('q-7', R, 4, 'A lamp takes 0.5 A from a 6 V supply. What charge passes through it in 2 minutes?', ['1 C', '60 C', '3 C', '720 C'], 1, 'Q = It = 0.5 × 120 = 60 C.'),
  q('q-8', C, 4, 'A 2 Ω resistor is in series with two 4 Ω resistors in parallel. What is the total resistance?', ['10 Ω', '4 Ω', '6 Ω', '3 Ω'], 1, 'The parallel pair is 2 Ω, so the total is 2 + 2 = 4 Ω.'),
];

function fakeJwt(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, role: 'authenticated', exp: 4_102_444_800, email: 'sam@example.com' })}.sig`;
}

export function session() {
  return {
    access_token: fakeJwt(),
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 4_102_444_800,
    user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'sam@example.com', app_metadata: {}, user_metadata: {}, created_at: iso(-90) },
  };
}

function fixtures(o: MockOptions) {
  const empty = !!o.empty;
  const profile = {
    id: USER_ID, email: 'sam@example.com', username: 'sam_k', display_name: o.role === 'parent' ? 'Priya' : 'Sam',
    role: o.role ?? 'student', program: o.onboarded === false ? null : 'igcse', igcse_tier: o.onboarded === false ? null : 'extended', timezone: 'UTC',
    onboarded_at: o.onboarded === false ? null : iso(-40), leaderboard_opt_in: true, tutor_style: 'balanced',
    subscription: o.tier ?? 'parent', founding_member: false, study_minutes_per_day: 45, study_days_per_week: 5, xp: empty ? 0 : 3240, streak_days: empty ? 0 : 6, longest_streak: empty ? 0 : 11,
    last_study_date: empty ? null : day(-1), created_at: iso(-40),
  };
  const subjects = o.onboarded === false ? [] : [
    { subject_key: 'igcse.physics', exam_date: day(38), target_grade: 'A*', confidence: null },
    { subject_key: 'igcse.chemistry', exam_date: day(45), target_grade: 'A', confidence: null },
    { subject_key: 'igcse.mathematics', exam_date: day(52), target_grade: 'A*', confidence: null },
    { subject_key: 'igcse.biology', exam_date: null, target_grade: null, confidence: null },
  ];
  const stat = (s: string, t: string, attempts: number, correct: number, recent: number, ago: number) =>
    ({ subject_key: s, topic_key: t, attempts, correct, recent_score: recent, last_attempt_at: iso(-ago) });
  const topic_stats = empty ? [] : [
    stat('igcse.physics', 'electricity', 34, 13, 0.34, 1), stat('igcse.physics', 'waves', 22, 18, 0.86, 2),
    stat('igcse.physics', 'motion-forces-energy', 18, 12, 0.7, 4), stat('igcse.physics', 'thermal', 6, 4, 0.66, 9),
    stat('igcse.chemistry', 'organic', 28, 12, 0.41, 1), stat('igcse.chemistry', 'physical', 20, 15, 0.8, 3),
    stat('igcse.mathematics', 'algebra', 40, 33, 0.9, 1), stat('igcse.mathematics', 'geometry', 15, 9, 0.55, 6),
    stat('igcse.biology', 'cells', 12, 11, 0.93, 5),
  ];
  const daily_activity = empty ? [] : Array.from({ length: 70 }, (_, i) => {
    const off = -69 + i;
    const q = (i * 37) % 11 === 0 ? 0 : 6 + ((i * 13) % 19);
    return { day: day(off), questions: q, correct: Math.round(q * (0.55 + ((i * 7) % 30) / 100)), xp: q * 14, practice_seconds: q * 55, reviews: i % 3 === 0 ? 12 : 0 };
  });
  const sessions = empty ? [] : [
    { id: 's1', subject_key: 'igcse.physics', topic_key: 'electricity', mode: 'weakness', question_count: 10, correct_count: 6, practice_seconds: 540, xp_earned: 150, started_at: iso(-1), ended_at: iso(-1) },
    { id: 's2', subject_key: null, topic_key: null, mode: 'daily', question_count: 10, correct_count: 8, practice_seconds: 480, xp_earned: 180, started_at: iso(-2), ended_at: iso(-2) },
    { id: 's3', subject_key: 'igcse.chemistry', topic_key: null, mode: 'practice', question_count: 8, correct_count: 5, practice_seconds: 400, xp_earned: 100, started_at: iso(-3), ended_at: iso(-3) },
  ];
  const attempts = empty ? [] : Array.from({ length: 60 }, (_, i) => ({
    subject_key: ['igcse.chemistry', 'igcse.physics', 'igcse.mathematics'][i % 3],
    topic_key: ['organic', 'electricity', 'algebra'][i % 3],
    correct: i % 4 !== 0,
    created_at: iso(-(i % 5)),
    question_ref: `b:${i}`,
  }));
  return {
    profile,
    tables: {
      student_subjects: subjects,
      topic_stats,
      daily_activity,
      practice_sessions: sessions,
      question_attempts: attempts,
      goals: empty ? [] : [
        { id: 'g1', kind: 'questions', period: 'weekly', subject_key: null, target: 100, target_label: null, due_date: null, created_at: iso(-10), archived_at: null },
        { id: 'g2', kind: 'paper_score', period: 'by_date', subject_key: 'igcse.physics', target: 80, target_label: 'A*', due_date: day(30), created_at: iso(-20), archived_at: null },
      ],
      notes: empty ? [] : [
        { id: 'n1', subject_key: 'igcse.chemistry', title: 'Alkanes vs alkenes', body: 'Alkanes: single C–C bonds, saturated, CnH2n+2.\nAlkenes: at least one C=C double bond, unsaturated, CnH2n. Bromine water turns colourless with alkenes.', created_at: iso(-6), updated_at: iso(-1) },
        { id: 'n2', subject_key: 'igcse.physics', title: 'Series and parallel circuits', body: 'Series: same current everywhere; resistances add.\nParallel: same voltage across each branch; 1/R = 1/R1 + 1/R2.', created_at: iso(-12), updated_at: iso(-3) },
      ],
      flashcard_decks: empty ? [] : [
        { id: 'd1', title: 'Organic chemistry', subject_key: 'igcse.chemistry', source: 'ai', created_at: iso(-8) },
        { id: 'd2', title: 'Physics equations', subject_key: 'igcse.physics', source: 'manual', created_at: iso(-15) },
      ],
      flashcards: empty ? [] : [
        { id: 'c1', deck_id: 'd1', front: 'What is the general formula of an alkene?', back: 'CₙH₂ₙ', ease: 2.5, interval_days: 0, repetitions: 0, lapses: 0, due_at: iso(-1), last_reviewed_at: null, created_at: iso(-8) },
        { id: 'c2', deck_id: 'd1', front: 'Test for an alkene?', back: 'Bromine water turns from orange to colourless.', ease: 2.5, interval_days: 1, repetitions: 1, lapses: 0, due_at: iso(-0.1), last_reviewed_at: iso(-1), created_at: iso(-8) },
        { id: 'c3', deck_id: 'd2', front: 'Equation linking power, current and voltage', back: 'P = IV', ease: 2.6, interval_days: 6, repetitions: 2, lapses: 0, due_at: iso(3), last_reviewed_at: iso(-3), created_at: iso(-15) },
      ],
      skill_mastery: empty ? [] : [
        { skill_id: R, attempts: 14, correct: 5, hints_used: 1, rating: -0.9, mastery: 28, recent_score: 0.3, correct_streak: 0, incorrect_streak: 2, review_level: 0, interval_days: 0, next_review_at: iso(-0.2), first_seen_at: iso(-20), last_practiced_at: iso(-1) },
        { skill_id: C, attempts: 9, correct: 5, hints_used: 0, rating: -0.2, mastery: 45, recent_score: 0.55, correct_streak: 1, incorrect_streak: 0, review_level: 1, interval_days: 1, next_review_at: iso(0.8), first_seen_at: iso(-15), last_practiced_at: iso(-2) },
        { skill_id: W, attempts: 12, correct: 10, hints_used: 0, rating: 1.4, mastery: 80, recent_score: 0.9, correct_streak: 4, incorrect_streak: 0, review_level: 3, interval_days: 7, next_review_at: iso(5), first_seen_at: iso(-30), last_practiced_at: iso(-2) },
        { skill_id: 'igcse.chemistry/organic/hydrocarbons', attempts: 10, correct: 4, hints_used: 0, rating: -0.6, mastery: 34, recent_score: 0.4, correct_streak: 0, incorrect_streak: 1, review_level: 0, interval_days: 0, next_review_at: iso(0.5), first_seen_at: iso(-10), last_practiced_at: iso(-1) },
      ],
      student_misconceptions: empty ? [] : [
        { misconception_id: 'mc1', evidence_count: 3, avoided_count: 0, last_seen_at: iso(-1), resolved_at: null, misconception: { key: 'multiplies-v-and-r', description: 'Multiplies voltage by resistance to find current instead of dividing.', skill_id: R } },
      ],
      resources: [
        { id: 'r1', subject_key: 'igcse.physics', program: 'igcse', title: 'Cambridge IGCSE Physics (0625): syllabus and specimen papers', provider: 'Cambridge International', resource_type: 'syllabus', year: null, session: null, paper_number: null, variant: null, component: null, tier: null, access: 'external', source_type: 'official_reference', license: null, external_url: 'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-physics-0625/', storage_path: null, duration_minutes: null, max_marks: null, status: 'active', last_checked_at: iso(-2) },
        { id: 'r2', subject_key: 'igcse.chemistry', program: 'igcse', title: 'Cambridge IGCSE Chemistry (0620): syllabus and specimen papers', provider: 'Cambridge International', resource_type: 'syllabus', year: null, session: null, paper_number: null, variant: null, component: null, tier: null, access: 'external', source_type: 'official_reference', license: null, external_url: 'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-chemistry-0620/', storage_path: null, duration_minutes: null, max_marks: null, status: 'unavailable', last_checked_at: iso(-1) },
        { id: 'r3', subject_key: 'sat.math', program: 'sat', title: 'Official SAT practice tests (full-length, digital)', provider: 'College Board', resource_type: 'practice_test', year: null, session: null, paper_number: null, variant: null, component: null, tier: null, access: 'external', source_type: 'official_reference', license: null, external_url: 'https://satsuite.collegeboard.org/practice/practice-tests', storage_path: null, duration_minutes: null, max_marks: null, status: 'active', last_checked_at: iso(-2) },
        { id: 'r4', subject_key: 'igcse.physics', program: 'igcse', title: 'Electricity practice paper', provider: 'Chapter', resource_type: 'question_paper', year: 2026, session: 'practice', paper_number: 2, variant: null, component: 'Multiple choice', tier: 'extended', access: 'download', source_type: 'owned', license: 'Proprietary: Chapter', external_url: null, storage_path: 'igcse.physics/chapter-electricity-p2.pdf', duration_minutes: 45, max_marks: 40, status: 'active', last_checked_at: null },
      ],
      paper_attempts: empty ? [] : [
        { id: 'p1', paper_id: null, subject_key: 'igcse.physics', title: 'Paper 4 (Extended), May/June 2024', score: 58, max_score: 80, completed_on: day(-5), duration_minutes: 75, reflection: null, created_at: iso(-5) },
        { id: 'p2', paper_id: null, subject_key: 'igcse.chemistry', title: 'Paper 2, Oct/Nov 2023', score: 31, max_score: 40, completed_on: day(-12), duration_minutes: 45, reflection: 'Rushed the organic section', created_at: iso(-12) },
      ],
      tutor_conversations: empty ? [] : [
        { id: 'conv1', title: 'Why does resistance add in series?', subject_key: 'igcse.physics', created_at: iso(-1), updated_at: iso(-1) },
        { id: 'conv2', title: 'Study plan for my chemistry exam', subject_key: 'igcse.chemistry', created_at: iso(-4), updated_at: iso(-4) },
      ],
      tutor_messages: [
        { id: 1, conversation_id: 'conv1', role: 'user', content: 'Why do resistances add up in series?', attachments: [], mode: 'explain', created_at: iso(-1) },
        { id: 2, conversation_id: 'conv1', role: 'assistant', content: 'In a series circuit the **same current** flows through every component, so the voltages add:\n\n$$V = V_1 + V_2 = IR_1 + IR_2 = I(R_1 + R_2)$$\n\nComparing with $V = IR_{total}$ gives $R_{total} = R_1 + R_2$.\n\n**Quick check:** what is the total resistance of 4 Ω and 6 Ω in series?', attachments: [], mode: 'explain', created_at: iso(-1) },
      ],
      student_memory: empty ? [] : [
        { id: 'm1', kind: 'struggle', subject_key: 'igcse.physics', content: 'Finds parallel resistance calculations hard', source: 'tutor', evidence_count: 2, updated_at: iso(-1) },
        { id: 'm2', kind: 'preference', subject_key: null, content: 'Learns best from worked examples', source: 'user', evidence_count: 1, updated_at: iso(-8) },
      ],
    } as Record<string, unknown[]>,
    rpc: {
      quota_status: profile.subscription === 'free' ? { unlimited: false, tier: 'free', used: 64, limit: 100, remaining: 36, resets_on: day(20) } : { unlimited: true, tier: profile.subscription },
      my_ai_allowance: { allowed: true, tier: profile.subscription, cap: profile.subscription === 'free' ? 30 : 900, used: 9, remaining: 21, reason: null },
      my_tier: profile.subscription,
      get_leaderboard: {
        week_start: day(-3), week_end: day(3), program: 'igcse', size: 7,
        entries: [
          { rank: 1, username: 'nadia.r', xp: 1840, is_me: false }, { rank: 2, username: 'omar_22', xp: 1510, is_me: false },
          { rank: 3, username: 'sam_k', xp: 1230, is_me: true }, { rank: 4, username: 'lina.h', xp: 990, is_me: false },
          { rank: 5, username: 'yusuf', xp: 640, is_me: false },
        ],
        me: { rank: 3, xp: 1230 },
      },
      my_parent_links: { parents: [], invite: null },
      my_subscription: { tier: profile.subscription, paywall_enabled: o.tier === undefined ? false : true, founding_member: false, active: [] },
      my_students: o.role === 'parent' ? [{ student_id: USER_ID, name: 'Sam', program: 'igcse', linked_at: iso(-10) }] : [],
      export_my_data: { exported_at: iso(0) },
      review_flashcard: { id: 'c1', interval_days: 1 },
      parent_student_overview: null as unknown,
      due_reviews: empty ? [] : [
        { skill_id: R, subject_key: 'igcse.physics', topic_key: 'electricity', name: 'Resistance & Ohm’s law', mastery: 28, next_review_at: iso(-0.2), interval_days: 0, incorrect_streak: 2 },
      ],
      is_admin: !!o.admin,
      log_client_event: null,
      record_skip: null,
      add_flashcards: { added: 2, skipped: 0 },
      admin_overview: o.admin ? { questions_by_status: { published: 394, pending_review: 12 }, questions_by_source: { owned: 394 }, open_reports: 1, resources_unavailable: 1, errors_24h: 0, skills_without_questions: 3 } : null,
      admin_question_health: [],
      admin_ai_usage: o.admin ? { since: iso(-30), totals: { requests: 0, failures: 0, input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0, avg_duration_ms: 0 }, by_model: [], by_task: [], by_day: [] } : null,
    } as Record<string, unknown>,
  };
}

export async function mockBackend(page: Page, opts: MockOptions & { signedIn?: boolean } = {}) {
  const fx = fixtures(opts);
  fx.rpc.parent_student_overview = {
    student: { name: 'Sam', program: 'igcse', igcse_tier: 'extended', timezone: 'UTC', xp: 3240, streak_days: 6, longest_streak: 11, last_study_date: day(-1), today: day(0) },
    subjects: fx.tables.student_subjects, topic_stats: fixtures({}).tables.topic_stats,
    activity: fixtures({}).tables.daily_activity, goals: fixtures({}).tables.goals, papers: fixtures({}).tables.paper_attempts,
    skills: { weakest: [{ skill_id: R, name: 'Resistance & Ohm’s law', subject_key: 'igcse.physics', mastery: 28, attempts: 14 }], secure: 5, practised: 9, due_reviews: 1, recurring_mistakes: 1 },
  };
  const submitted: Array<Record<string, unknown>> = [];
  const inserted: Array<{ table: string; body: unknown }> = [];

  if (opts.signedIn !== false) {
    await page.addInitScript((s) => {
      localStorage.setItem('chapter.auth', JSON.stringify(s));
    }, session());
  }

  await page.route(`${MOCK_URL}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) });

    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    }
    if (path.startsWith('/auth/v1/')) {
      if (path.endsWith('/user')) return json(session().user);
      if (path.endsWith('/token')) return json(session());
      if (path.endsWith('/logout')) return route.fulfill({ status: 204 });
      return json({});
    }
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/').pop()!;
      const args = (req.postDataJSON?.() ?? {}) as Record<string, unknown>;
      if (fn === 'get_practice_pool') {
        const skills = args.p_skills as string[] | null;
        return json(POOL.filter((r) => r.subject_key === args.p_subject && (!skills || skills.includes(r.skill_id))
          && (!args.p_topic || r.topic_key === args.p_topic)));
      }
      if (fn === 'submit_attempt') {
        const question = POOL.find((r) => r.id === args.p_question_id);
        if (!question) return json({ code: 'P0002', message: 'question_not_found' }, 400);
        const duplicate = submitted.some((x) => x.p_client_id === args.p_client_id);
        submitted.push(args);
        const correct = args.p_selected === question.correct_index;
        return json({
          duplicate, correct, correct_index: question.correct_index, xp: correct ? (args.p_hints ? 10 : 20) : 0, skill_id: question.skill_id,
          mastery_before: 28, mastery_after: correct ? 33 : 25,
          misconception: !correct && question.id === 'q-2' ? 'Multiplies voltage by resistance to find current instead of dividing.' : null,
        });
      }
      return json(fx.rpc[fn] ?? null);
    }
    if (path.startsWith('/rest/v1/')) {
      const table = path.split('/').pop()!;
      if (method === 'GET' || method === 'HEAD') {
        if (table === 'profiles') {
          const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
          return json(single ? fx.profile : [fx.profile]);
        }
        let rows = (fx.tables[table] ?? []) as Array<Record<string, unknown>>;
        const deck = url.searchParams.get('deck_id');
        if (deck?.startsWith('eq.')) rows = rows.filter((r) => r.deck_id === deck.slice(3));
        const conv = url.searchParams.get('conversation_id');
        if (conv?.startsWith('eq.')) rows = rows.filter((r) => r.conversation_id === conv.slice(3));
        const id = url.searchParams.get('id');
        if (id?.startsWith('eq.')) rows = rows.filter((r) => r.id === id.slice(3));
        const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
        return json(single ? rows[0] ?? null : rows, 200, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
      }
      const body = req.postDataJSON?.() ?? null;
      inserted.push({ table, body });
      if (method === 'PATCH' && table === 'profiles') {
        Object.assign(fx.profile, body);
        return json(fx.profile);
      }
      const rows = Array.isArray(body) ? body : [body];
      const withIds = rows.map((r: Record<string, unknown>, i: number) => ({ id: `new-${inserted.length}-${i}`, created_at: iso(0), updated_at: iso(0), ...r }));
      const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      return json(single ? withIds[0] : withIds, method === 'POST' ? 201 : 200);
    }
    if (path.startsWith('/functions/v1/ai-tutor')) {
      // persist the exchange as the real function does
      const sent = (req.postDataJSON?.() ?? {}) as { message?: string };
      fx.tables.tutor_messages.push(
        { id: 3, conversation_id: 'conv-new', role: 'user', content: sent.message ?? '', attachments: [], mode: 'chat', created_at: iso(0) },
        { id: 4, conversation_id: 'conv-new', role: 'assistant', content: 'Great question. Think about what stays the **same** in a series circuit: the current. So the voltages across each resistor add up, which means $R = R_1 + R_2$. What do you think happens in parallel?', attachments: [], mode: 'chat', created_at: iso(0) },
      );
      const frames = [
        ['meta', { conversation_id: 'conv-new', remaining: 20 }],
        ['delta', { text: 'Great question. Think about what stays the **same** in a series circuit: ' }],
        ['delta', { text: 'the current. So the voltages across each resistor add up, which means $R = R_1 + R_2$.\n\nWhat do you think happens in parallel?' }],
        ['done', { message_id: 3 }],
      ];
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' },
        body: frames.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(''),
      });
    }
    if (path.startsWith('/functions/v1/')) {
      return json({ ok: false, error: 'ai_unavailable' }, 503);
    }
    if (path.startsWith('/storage/v1/')) return json([]);
    return json({});
  });

  return { inserted, submitted, fixtures: fx };
}
