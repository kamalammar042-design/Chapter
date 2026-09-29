// ============================================================
// Edge Function: ai-tutor
// ------------------------------------------------------------
// POST /functions/v1/ai-tutor   (Authorization: Bearer <access token>)
// Body: { conversation_id?, message, mode?, subject_key?, topic_key?,
//         images?: [{ data: base64 }], question?: {question, options,
//         chosen, correct, explanation} }
//
// Responds with a Server-Sent Events stream:
//   event: meta   { conversation_id, remaining }
//   event: delta  { text }
//   event: done   { message_id, truncated, verdict? }   verdict: check mode only
//   event: error  { error }
//
// Order of operations is deliberate: authenticate → validate → check the
// monthly allowance → only then spend money on the model. Every message
// is persisted server-side, so conversation history cannot be forged.
// ============================================================
import { errorResponse, sse } from '../_shared/http.ts';
import { admin, log, readJson, recordUsage, serveAuthed } from '../_shared/server.ts';
import { routeFor } from '../_shared/ai/models.ts';
import { AIError, aiErrorToHttp, type ChatTurn } from '../_shared/ai/provider.ts';
import { createProvider } from '../_shared/ai/select.ts';
import {
  MEMORY_SCHEMA, MEMORY_SYSTEM, MODE_TASK, STABLE_SYSTEM, buildDynamicSystem, composeUserMessage,
  conversationTitle, parseCheckVerdict, sanitizeMemories, type StudentContext,
} from '../_shared/prompts.ts';
import { parseTutorRequest } from '../_shared/tutor-request.ts';
import { extensionFor } from '../_shared/images.ts';

const HISTORY_LIMIT = 24;
const MAX_REQUEST_BYTES = 22 * 1024 * 1024; // 3 images × 5 MB, base64
const env = (k: string) => Deno.env.get(k);

serveAuthed('ai-tutor', async ({ req, user, cors }) => {
  const body = await readJson(req, MAX_REQUEST_BYTES);
  if (!body) return errorResponse('invalid_request', 400, cors, { field: 'body' });
  const parsed = parseTutorRequest(body);
  if (!parsed.ok) return errorResponse('invalid_request', 400, cors, { field: parsed.field, reason: parsed.reason });
  const input = parsed.value;
  const db = admin();

  // ---- allowance -------------------------------------------------------
  const { data: gate, error: gateErr } = await db.rpc('service_can_use_ai', { p_user: user.id, p_kind: 'tutor_message' });
  if (gateErr) throw gateErr;
  if (!gate?.allowed) {
    const reason = gate?.reason === 'slow_down' ? 'slow_down' : gate?.reason === 'upgrade_required' ? 'upgrade_required' : 'monthly_cap_reached';
    return errorResponse(reason, reason === 'slow_down' ? 429 : 402, cors, { cap: gate?.cap, used: gate?.used });
  }

  let provider, kind;
  try {
    ({ provider, kind } = createProvider());
  } catch {
    log('error', 'provider_unavailable', { fn: 'ai-tutor' });
    return errorResponse('ai_unavailable', 503, cors);
  }
  const route = routeFor(MODE_TASK[input.mode], env, kind);

  // ---- conversation ----------------------------------------------------
  const userText = composeUserMessage(input.message, input.question);
  let conversationId = input.conversationId;
  if (conversationId) {
    const { data: conv } = await db
      .from('tutor_conversations').select('id').eq('id', conversationId).eq('user_id', user.id).maybeSingle();
    if (!conv) return errorResponse('not_found', 404, cors);
  } else {
    const { data: conv, error } = await db.from('tutor_conversations').insert({
      user_id: user.id,
      title: conversationTitle(userText, input.mode),
      subject_key: input.subjectKey,
    }).select('id').single();
    if (error) throw error;
    conversationId = conv.id as string;
  }

  // ---- store uploads + the user's message --------------------------------
  const paths: string[] = [];
  for (const img of input.images) {
    const path = `${user.id}/${conversationId}/${crypto.randomUUID()}.${extensionFor(img.mediaType)}`;
    const { error } = await db.storage.from('tutor-uploads').upload(path, img.bytes, { contentType: img.mediaType });
    if (error) log('warn', 'upload_failed', { fn: 'ai-tutor', message: error.message });
    else paths.push(path);
  }

  const { data: history, error: histErr } = await db
    .from('tutor_messages').select('role, content, attachments')
    .eq('conversation_id', conversationId).eq('user_id', user.id)
    .order('id', { ascending: false }).limit(HISTORY_LIMIT);
  if (histErr) throw histErr;

  const { error: insErr } = await db.from('tutor_messages').insert({
    conversation_id: conversationId, user_id: user.id, role: 'user',
    content: userText || '(image)', attachments: paths, mode: input.mode,
  });
  if (insErr) throw insErr;

  const turns: ChatTurn[] = (history ?? []).reverse().map((m) => ({
    role: m.role as 'user' | 'assistant',
    text: (Array.isArray(m.attachments) && m.attachments.length ? '[The student shared an image earlier.]\n' : '') + m.content,
  }));
  // the API requires the conversation to start with a user turn
  while (turns.length && turns[0].role !== 'user') turns.shift();
  turns.push({
    role: 'user',
    text: userText,
    attachments: input.images.map((i) => ({ kind: 'image' as const, mediaType: i.mediaType, base64: i.base64 })),
  });

  // ---- student context ---------------------------------------------------
  // Focused context: this subject/topic's weak skills, misconceptions and mistakes.
  const { data: ctx } = await db.rpc('service_student_context', {
    p_user: user.id, p_subject: input.subjectKey, p_topic: input.topicKey,
  });
  const context = (ctx ?? {}) as StudentContext;
  let subjectName: string | null = null;
  let topicName: string | null = null;
  if (input.subjectKey) {
    const { data: s } = await db.from('catalog_subjects').select('name, program').eq('key', input.subjectKey).maybeSingle();
    subjectName = s ? (s.program === 'sat' ? `SAT ${s.name}` : `IGCSE ${s.name}`) : null;
    if (s && input.topicKey) {
      const { data: t } = await db.from('catalog_topics').select('name')
        .eq('subject_key', input.subjectKey).eq('key', input.topicKey).maybeSingle();
      topicName = t?.name ?? null;
    }
  }
  const system = {
    stable: STABLE_SYSTEM,
    dynamic: buildDynamicSystem(context, { mode: input.mode, subject: subjectName, topic: topicName, hintLevel: input.hintLevel }),
  };

  // ---- stream ------------------------------------------------------------
  const encoder = new TextEncoder();
  const remaining = Math.max(0, Number(gate.remaining ?? 0) - 1);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try { controller.enqueue(encoder.encode(sse(event, data))); } catch { /* client went away */ }
      };
      send('meta', { conversation_id: conversationId, remaining });

      const started = Date.now();
      try {
        const result = await provider.streamChat({
          route, system, turns, maxTokens: input.mode === 'hint' ? 4000 : 16000, signal: req.signal,
          onText: (text) => send('delta', { text }),
        });

        if (result.stopReason === 'refusal' || !result.text.trim()) {
          await recordUsage(user.id, 'tutor_message', false, result.usage, { task: route.task, durationMs: Date.now() - started, errorCode: 'refused' });
          send('error', { error: 'ai_refused' });
          controller.close();
          return;
        }

        const { data: saved, error } = await db.from('tutor_messages').insert({
          conversation_id: conversationId, user_id: user.id, role: 'assistant',
          content: result.text.slice(0, 40000), mode: input.mode,
          input_tokens: result.usage.inputTokens, output_tokens: result.usage.outputTokens,
        }).select('id').single();
        if (error) log('error', 'save_failed', { fn: 'ai-tutor', message: error.message });
        await db.from('tutor_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
        await recordUsage(user.id, 'tutor_message', true, result.usage, { task: route.task, durationMs: Date.now() - started });
        send('done', {
          message_id: saved?.id ?? null,
          truncated: result.stopReason === 'max_tokens',
          verdict: input.mode === 'check' ? parseCheckVerdict(result.text) ?? 'unclear' : undefined,
        });

        // Memory: learn durable facts from substantive turns. Runs after
        // `done`, so the student never waits for it; failures are ignored.
        if (shouldExtractMemory(input.mode, userText, turns.length)) {
          try {
            const existing = (context.memory ?? []).map((m) => `- ${m.content}`).join('\n') || '(none)';
            const memRoute = routeFor('memory', env, kind);
            const memStart = Date.now();
            const res = await provider.json({
              route: memRoute,
              system: MEMORY_SYSTEM,
              prompt: `Existing notes:\n${existing}\n\n<exchange>\nStudent: ${userText.slice(0, 4000)}\n\nTutor: ${result.text.slice(0, 4000)}\n</exchange>`,
              schema: MEMORY_SCHEMA as unknown as Record<string, unknown>,
              maxTokens: 2000,
            });
            await recordUsage(user.id, 'internal', true, res.usage, { task: 'memory', durationMs: Date.now() - memStart });
            for (const m of sanitizeMemories(res.data)) {
              await db.rpc('service_remember', { p_user: user.id, p_kind: m.kind, p_subject: m.subject, p_content: m.content });
            }
          } catch (e) {
            log('warn', 'memory_skipped', { fn: 'ai-tutor', code: e instanceof AIError ? e.code : 'error' });
          }
        }
      } catch (e) {
        const err = e instanceof AIError ? e : new AIError('unavailable', String(e));
        log('error', 'model_error', { fn: 'ai-tutor', task: route.task, code: err.code });
        await recordUsage(user.id, 'tutor_message', false, undefined, { task: route.task, model: route.model, durationMs: Date.now() - started, errorCode: err.code });
        send('error', { error: aiErrorToHttp(err.code).error });
      }
      try { controller.close(); } catch { /* already closed */ }
    },
  });

  return new Response(stream, {
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
});

function shouldExtractMemory(mode: string, userText: string, turnCount: number): boolean {
  if (['mistake', 'check', 'plan'].includes(mode)) return true;
  if (mode === 'hint' || mode === 'practice') return false;
  if (userText.length < 40) return false;
  // every other substantive turn keeps cost down without missing much
  return turnCount % 2 === 1;
}
