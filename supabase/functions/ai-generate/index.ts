// ============================================================
// Edge Function: ai-generate
// ------------------------------------------------------------
// POST /functions/v1/ai-generate
//   { kind: 'flashcards', subject_key, topic_key?, source_text?, count? }
//     → { ok, cards: [{front, back}], remaining }
//   { kind: 'questions', subject_key, topic_key, count?, difficulty? (1–5),
//     skill_id?, pdf? }
//     → { ok, rows: PoolRow[], published, pending_review, rejected, remaining }
//
// Questions go through the quality pipeline (_shared/pipeline.ts): a second
// model solves each one without seeing the answer key, and only questions
// that pass every check are published. The rest are stored for human review
// or rejected, with the full validation report, and every stored row carries
// its provenance. Questions made from a student's own PDF stay private to
// that student.
// ============================================================
import { SUBJECT_KEY_RE, TOPIC_KEY_RE, errorResponse, jsonResponse } from '../_shared/http.ts';
import { admin, log, readJson, recordUsage, serveAuthed } from '../_shared/server.ts';
import { AIError, aiErrorToHttp, type AIProvider, type Attachment } from '../_shared/ai/provider.ts';
import { createProvider } from '../_shared/ai/select.ts';
import { routeFor, type ProviderKind } from '../_shared/ai/models.ts';
import { FLASHCARD_SCHEMA, GENERATE_SYSTEM, flashcardPrompt, sanitizeFlashcards } from '../_shared/generate.ts';
import {
  GENERATION_SCHEMA, GENERATION_SYSTEM, PROMPT_VERSION, VERIFY_SCHEMA, VERIFY_SYSTEM, contentHash, generationPrompt,
  parseDrafts, parseVerification, validateDraft, verifyPrompt, type SkillBrief, type Verification,
} from '../_shared/pipeline.ts';
import { validatePdf } from '../_shared/images.ts';

const MAX_REQUEST_BYTES = 15 * 1024 * 1024;
const env = (k: string) => Deno.env.get(k);
const LEGACY_DIFFICULTY: Record<string, number> = { easy: 2, medium: 3, hard: 4 };
const POOL_COLUMNS = 'id, subject_key, topic_key, skill_id, question_type, template_key, stem, options, correct_index, explanation, hint, difficulty, cognitive_level, source_type, source_name';

serveAuthed('ai-generate', async ({ req, user, cors }) => {
  const body = await readJson(req, MAX_REQUEST_BYTES);
  if (!body) return errorResponse('invalid_request', 400, cors, { field: 'body' });

  const kind = body.kind;
  if (kind !== 'flashcards' && kind !== 'questions') return errorResponse('invalid_request', 400, cors, { field: 'kind' });
  const subjectKey = typeof body.subject_key === 'string' && SUBJECT_KEY_RE.test(body.subject_key) ? body.subject_key : null;
  if (!subjectKey) return errorResponse('invalid_request', 400, cors, { field: 'subject_key' });
  const topicKey = typeof body.topic_key === 'string' && TOPIC_KEY_RE.test(body.topic_key) ? body.topic_key : null;
  if (kind === 'questions' && !topicKey) return errorResponse('invalid_request', 400, cors, { field: 'topic_key' });

  const db = admin();
  const { data: subject } = await db.from('catalog_subjects').select('name, program').eq('key', subjectKey).maybeSingle();
  if (!subject) return errorResponse('invalid_request', 400, cors, { field: 'subject_key' });
  let topicName: string | null = null;
  if (topicKey) {
    const { data: t } = await db.from('catalog_topics').select('name').eq('subject_key', subjectKey).eq('key', topicKey).maybeSingle();
    if (!t) return errorResponse('invalid_request', 400, cors, { field: 'topic_key' });
    topicName = t.name;
  }
  const subjectName = subject.program === 'sat' ? `SAT ${subject.name}` : `IGCSE ${subject.name}`;

  const { data: gate, error: gateErr } = await db.rpc('service_can_use_ai', { p_user: user.id, p_kind: 'generate' });
  if (gateErr) throw gateErr;
  if (!gate?.allowed) {
    const reason = gate?.reason === 'slow_down' ? 'slow_down' : gate?.reason === 'upgrade_required' ? 'upgrade_required' : 'monthly_cap_reached';
    return errorResponse(reason, reason === 'slow_down' ? 429 : 402, cors, { cap: gate?.cap, used: gate?.used });
  }

  let provider: AIProvider;
  let providerName: ProviderKind;
  try {
    ({ provider, kind: providerName } = createProvider());
  } catch {
    return errorResponse('ai_unavailable', 503, cors);
  }
  const remaining = Math.max(0, Number(gate.remaining ?? 0) - 1);

  if (kind === 'flashcards') {
    const route = routeFor('flashcards', env, providerName);
    const started = Date.now();
    try {
      const count = clampInt(body.count, 4, 20, 10);
      const source = typeof body.source_text === 'string' ? body.source_text.trim().slice(0, 20000) : null;
      const res = await provider.json({
        route,
        system: GENERATE_SYSTEM,
        prompt: flashcardPrompt({ subject: subjectName, topic: topicName, count, source }),
        schema: FLASHCARD_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 8000,
      });
      const cards = sanitizeFlashcards(res.data, count);
      if (!cards.length) throw new AIError('bad_response', 'no usable cards');
      await recordUsage(user.id, 'generate', true, res.usage, { task: 'flashcards', durationMs: Date.now() - started });
      return jsonResponse({ ok: true, cards, remaining }, 200, cors);
    } catch (e) {
      return aiFailure(e, user.id, 'flashcards', route.model, started, cors);
    }
  }

  // ---- questions ------------------------------------------------------------
  const count = clampInt(body.count, 3, 10, 5);
  const difficulty = typeof body.difficulty === 'number' && Number.isInteger(body.difficulty) && body.difficulty >= 1 && body.difficulty <= 5
    ? body.difficulty
    : LEGACY_DIFFICULTY[String(body.difficulty)] ?? null;
  const attachments: Attachment[] = [];
  if (body.pdf != null) {
    const pdf = validatePdf(body.pdf);
    if (!pdf.ok) return errorResponse('invalid_request', 400, cors, { field: 'pdf', reason: pdf.reason });
    attachments.push({ kind: 'pdf', mediaType: 'application/pdf', base64: pdf.base64 });
  }
  const fromUpload = attachments.length > 0;

  let skillQuery = db.from('skills').select('id, key, name, objective, misconceptions(key, description)')
    .eq('subject_key', subjectKey).eq('topic_key', topicKey!).order('sort');
  if (typeof body.skill_id === 'string') skillQuery = skillQuery.eq('id', body.skill_id);
  const { data: skillRows, error: skillErr } = await skillQuery;
  if (skillErr) throw skillErr;
  if (!skillRows?.length) return errorResponse('invalid_request', 400, cors, { field: 'skill_id' });
  const skills: SkillBrief[] = skillRows.map((s) => ({
    key: s.key, name: s.name, objective: s.objective,
    misconceptions: ((s.misconceptions ?? []) as Array<{ key: string; description: string }>).slice(0, 8),
  }));
  const skillIdByKey = new Map(skillRows.map((s) => [s.key, s.id as string]));

  const { data: prof } = await db.from('profiles').select('igcse_tier').eq('id', user.id).maybeSingle();
  const level = subject.program === 'sat' ? 'SAT' : prof?.igcse_tier === 'core' ? 'IGCSE Core' : 'IGCSE Extended';

  const genRoute = routeFor('generate_questions', env, providerName);
  const verifyRoute = routeFor('verify_questions', env, providerName);
  const { data: run } = await db.from('content_generation_runs').insert({
    requested_by: user.id, subject_key: subjectKey, topic_key: topicKey, skill_id: typeof body.skill_id === 'string' ? body.skill_id : null,
    requested_count: count, model: genRoute.model,
  }).select('id').single();

  const started = Date.now();
  let generated;
  try {
    generated = await provider.json({
      route: genRoute,
      system: GENERATION_SYSTEM,
      prompt: generationPrompt({ subject: subjectName, topic: topicName!, level, count, difficulty, skills, fromDocument: fromUpload }),
      schema: GENERATION_SCHEMA as unknown as Record<string, unknown>,
      attachments,
      maxTokens: 16000,
    });
  } catch (e) {
    await finishRun(run?.id, { report: { error: e instanceof AIError ? e.code : 'unavailable' } });
    return aiFailure(e, user.id, 'generate_questions', genRoute.model, started, cors);
  }
  const genMs = Date.now() - started;

  const { drafts, dropped } = parseDrafts(generated.data, skills.map((s) => s.key), count);

  // Independent solve: the verifier sees stems and options, never the key.
  let verifications = new Map<number, Verification>();
  if (drafts.length) {
    const vStart = Date.now();
    try {
      const v = await provider.json({
        route: verifyRoute,
        system: VERIFY_SYSTEM,
        prompt: verifyPrompt({ subject: subjectName, topic: topicName!, level, questions: drafts.map((d) => ({ stem: d.stem, options: d.options })) }),
        schema: VERIFY_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 16000,
      });
      verifications = parseVerification(v.data, drafts.length);
      await recordUsage(user.id, 'internal', true, v.usage, { task: 'verify_questions', durationMs: Date.now() - vStart });
    } catch (e) {
      // Without verification nothing is published; drafts wait for review.
      const code = e instanceof AIError ? e.code : 'unavailable';
      log('warn', 'verify_failed', { fn: 'ai-generate', code });
      await recordUsage(user.id, 'internal', false, undefined, { task: 'verify_questions', model: verifyRoute.model, durationMs: Date.now() - vStart, errorCode: code });
    }
  }

  const { data: existing } = await db.from('questions').select('stem')
    .eq('subject_key', subjectKey).eq('topic_key', topicKey!).in('status', ['published', 'pending_review', 'draft'])
    .or(`owner_id.is.null,owner_id.eq.${user.id}`).limit(3000);
  const others = (existing ?? []).map((r) => r.stem as string);

  const now = new Date().toISOString();
  const rows = [];
  const report: Array<{ stem: string; status: string; failed: string[] }> = [];
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const verdict = validateDraft(d, verifications.get(i), others);
    others.push(d.stem);
    report.push({ stem: d.stem.slice(0, 120), status: verdict.status, failed: verdict.checks.filter((c) => !c.ok).map((c) => c.name) });
    if (verdict.status === 'rejected') continue;
    const skillId = skillIdByKey.get(d.skill_key)!;
    const options = await optionsWithMisconceptions(d, skillId);
    rows.push({
      subject_key: subjectKey,
      topic_key: topicKey,
      skill_id: skillId,
      question_type: 'mcq',
      stem: d.stem,
      options,
      correct_index: d.correct,
      explanation: d.explanation,
      hint: d.hint || null,
      difficulty: d.difficulty,
      cognitive_level: /\d/.test(d.stem) ? 'apply' : 'understand',
      tier: level === 'IGCSE Core' ? 'core' : 'all',
      tags: ['ai-generated'],
      source_type: fromUpload ? 'user_uploaded' : 'generated',
      source_name: fromUpload ? 'Generated by Chapter from a student upload' : 'Chapter AI question generator',
      license: fromUpload ? 'Private: generated from a student upload' : 'Proprietary: Chapter',
      copyright_status: fromUpload ? 'user_provided' : 'generated',
      owner_id: fromUpload ? user.id : null,
      created_by: user.id,
      status: verdict.status,
      review_note: verdict.status === 'pending_review' ? `Needs review: ${verdict.checks.filter((c) => !c.ok).map((c) => c.detail ?? c.name).join('; ')}`.slice(0, 1000) : null,
      validation: { passed: verdict.passed, checks: verdict.checks, verifier: verifyRoute.model, verified: verifications.has(i), at: now },
      generator: { model: generated.usage.model ?? genRoute.model, prompt_version: PROMPT_VERSION, run_id: run?.id ?? null, from_upload: fromUpload },
      content_hash: await contentHash(subjectKey, d.stem, d.options),
    });
  }

  let stored: Array<Record<string, unknown>> = [];
  if (rows.length) {
    const { data, error } = await db.from('questions')
      .upsert(rows, { onConflict: 'content_hash', ignoreDuplicates: true })
      .select(`${POOL_COLUMNS}, status`);
    if (error) throw error;
    stored = data ?? [];
  }
  const published = stored.filter((r) => r.status === 'published');
  const pending = stored.filter((r) => r.status === 'pending_review').length;
  const rejected = drafts.length - rows.length + dropped;

  await finishRun(run?.id, { published: published.length, pending_review: pending, rejected, report: { items: report, dropped_at_schema: dropped } });
  // A request that produced nothing usable does not use up the student's allowance.
  await recordUsage(user.id, 'generate', published.length > 0, generated.usage, {
    task: 'generate_questions', durationMs: genMs, errorCode: published.length ? undefined : 'none_passed',
  });
  log('info', 'questions_generated', { fn: 'ai-generate', run: run?.id, requested: count, published: published.length, pending, rejected });

  return jsonResponse({
    ok: true,
    rows: published.map(({ status: _s, ...r }) => ({ ...r, recently_seen: false })),
    published: published.length,
    pending_review: pending,
    rejected,
    remaining: published.length ? remaining : remaining + 1,
  }, 200, cors);

  async function optionsWithMisconceptions(d: { options: string[]; option_misconceptions: Array<string | null> }, skillId: string) {
    const keys = [...new Set(d.option_misconceptions.filter((k): k is string => !!k))];
    const ids = new Map<string, string>();
    if (keys.length) {
      const { data } = await db.from('misconceptions').select('id, key').eq('skill_id', skillId).in('key', keys);
      for (const m of data ?? []) ids.set(m.key, m.id);
    }
    return d.options.map((text, i) => {
      const id = d.option_misconceptions[i] ? ids.get(d.option_misconceptions[i]!) : undefined;
      return id ? { text, misconception_id: id } : { text };
    });
  }

  async function finishRun(id: string | undefined, patch: Record<string, unknown>) {
    if (!id) return;
    await db.from('content_generation_runs').update({ ...patch, finished_at: new Date().toISOString() }).eq('id', id);
  }
});

async function aiFailure(e: unknown, userId: string, task: 'flashcards' | 'generate_questions', model: string, started: number, cors: Record<string, string>) {
  const err = e instanceof AIError ? e : new AIError('unavailable', String(e));
  log('error', 'ai_failed', { fn: 'ai-generate', task, code: err.code });
  await recordUsage(userId, 'generate', false, undefined, { task, model, durationMs: Date.now() - started, errorCode: err.code });
  const mapped = aiErrorToHttp(err.code);
  return errorResponse(mapped.error, mapped.status, cors);
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? Math.round(v) : Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
