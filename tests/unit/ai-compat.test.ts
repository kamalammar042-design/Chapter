// Groq / OpenRouter provider (OpenAI-compatible chat API), with fetch mocked.
import { describe, expect, it } from 'vitest';
import {
  createCompatProvider, createGroqProvider, createOpenRouterProvider, estimateTokens, fitToBudget, mapStatus, strictCompatible,
  type CompatConfig,
} from '../../supabase/functions/_shared/ai/openai-compat';
import { estimateCost, providerKind, routeFor } from '../../supabase/functions/_shared/ai/models';
import { AIError } from '../../supabase/functions/_shared/ai/provider';
import { FLASHCARD_SCHEMA } from '../../supabase/functions/_shared/generate';
import { GENERATION_SCHEMA, VERIFY_SCHEMA } from '../../supabase/functions/_shared/pipeline';
import { MEMORY_SCHEMA } from '../../supabase/functions/_shared/prompts';

const env = (vars: Record<string, string>) => (k: string) => vars[k];

interface Call { url: string; headers: Record<string, string>; body: Record<string, unknown> }

function sseResponse(chunks: unknown[]): Response {
  const text = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + ': keep-alive\n\ndata: [DONE]\n\n';
  const bytes = new TextEncoder().encode(text);
  // split mid-line to exercise buffering
  const cut = Math.floor(bytes.length / 2);
  const body = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(bytes.slice(0, cut)); c.enqueue(bytes.slice(cut)); c.close(); },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function mockFetch(responses: Array<() => Response>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next();
  }) as unknown as typeof fetch;
  return { calls, impl };
}

function groq(fetchImpl: typeof fetch, extra: Partial<CompatConfig> = {}) {
  return createCompatProvider({
    name: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'gsk_test', visionModel: 'qwen/qwen3.8-27b',
    pdf: false, tokenBudget: 7500, fallbackModel: 'openai/gpt-oss-20b', fetchImpl, ...extra,
  });
}

describe('provider selection', () => {
  it('uses AI_PROVIDER when its key is set, otherwise the first key present', () => {
    expect(providerKind(env({}))).toBeNull();
    expect(providerKind(env({ GROQ_API_KEY: 'g' }))).toBe('groq');
    expect(providerKind(env({ OPENROUTER_API_KEY: 'o' }))).toBe('openrouter');
    expect(providerKind(env({ ANTHROPIC_API_KEY: 'a', GROQ_API_KEY: 'g' }))).toBe('anthropic');
    expect(providerKind(env({ AI_PROVIDER: 'groq', ANTHROPIC_API_KEY: 'a', GROQ_API_KEY: 'g' }))).toBe('groq');
    // an explicit choice without its key is off, not silently another vendor
    expect(providerKind(env({ AI_PROVIDER: 'openrouter', GROQ_API_KEY: 'g' }))).toBeNull();
    expect(providerKind(env({ GROQ_API_KEY: '   ' }))).toBeNull();
  });

  it('routes each provider to its own models and validates overrides', () => {
    const none = env({});
    expect(routeFor('tutor_chat', none, 'groq')).toMatchObject({ model: 'openai/gpt-oss-120b', effort: 'medium', thinking: false, fallbacks: false });
    expect(routeFor('memory', none, 'groq').model).toBe('openai/gpt-oss-20b');
    expect(routeFor('tutor_chat', none, 'openrouter')).toMatchObject({ model: 'anthropic/claude-haiku-4.5', effort: null, thinking: false });
    expect(routeFor('tutor_check', none, 'openrouter').model).toBe('anthropic/claude-sonnet-5');
    expect(routeFor('tutor_chat', env({ MODEL_TUTOR: 'llama-3.3-70b-versatile' }), 'groq')).toMatchObject({ model: 'llama-3.3-70b-versatile', effort: null });
    expect(routeFor('tutor_chat', env({ MODEL_TUTOR: 'claude-opus-5' }), 'openrouter').model).toBe('anthropic/claude-haiku-4.5');
    expect(routeFor('tutor_chat', env({ MODEL_TUTOR: 'x"; drop' }), 'groq').model).toBe('openai/gpt-oss-120b');
    // an Anthropic model name left over from another setup is not sent to Groq
    expect(routeFor('tutor_chat', env({ MODEL_TUTOR: 'claude-sonnet-5' }), 'groq').model).toBe('openai/gpt-oss-120b');
  });

  it('estimates cost for OpenRouter and Groq model names', () => {
    expect(estimateCost('anthropic/claude-haiku-4.5', { inputTokens: 1000, outputTokens: 1000 })).toBe(0.006);
    expect(estimateCost('openai/gpt-oss-120b', { inputTokens: 1_000_000, outputTokens: 0 })).toBe(0.15);
  });
});

describe('request shaping', () => {
  it('marks every Chapter schema as strict-compatible and rejects loose ones', () => {
    for (const s of [FLASHCARD_SCHEMA, GENERATION_SCHEMA, VERIFY_SCHEMA, MEMORY_SCHEMA]) expect(strictCompatible(s)).toBe(true);
    expect(strictCompatible({ type: 'object', properties: { a: { type: 'string' } }, required: [], additionalProperties: false })).toBe(false);
    expect(strictCompatible({ type: 'object', properties: { a: { type: 'array', minItems: 1 } }, required: ['a'], additionalProperties: false })).toBe(false);
  });

  it('drops the oldest turns to fit the budget and caps the reply', () => {
    const sys = [{ role: 'system' as const, content: 'x'.repeat(4000) }]; // ~1,000 tokens
    const turns = Array.from({ length: 12 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: 'y'.repeat(4000) }));
    turns.push({ role: 'user', content: 'latest question' });
    const fit = fitToBudget(sys, turns, 16000, 7500);
    expect(fit.turns[0].role).toBe('user');
    expect(fit.turns.at(-1)!.content).toBe('latest question');
    expect(fit.turns.length).toBeLessThan(turns.length);
    expect(estimateTokens([...sys, ...fit.turns]) + fit.maxTokens).toBeLessThanOrEqual(7500);
    expect(fit.maxTokens).toBeGreaterThanOrEqual(1024);
    expect(fitToBudget(sys, turns, 16000).maxTokens).toBe(16000);
    expect(() => fitToBudget(sys, [{ role: 'user', content: 'z'.repeat(40000) }], 4000, 7500)).toThrow(AIError);
  });

  it('maps HTTP failures to Chapter error codes', () => {
    expect(mapStatus(401).code).toBe('misconfigured');
    expect(mapStatus(402).code).toBe('unavailable');
    expect(mapStatus(413).code).toBe('bad_response');
    expect(mapStatus(429)).toMatchObject({ code: 'busy', retryable: true });
    expect(mapStatus(503).code).toBe('busy');
    expect(mapStatus(504).code).toBe('timeout');
  });
});

describe('Groq provider', () => {
  const route = routeFor('tutor_chat', env({}), 'groq');

  it('streams a reply with Groq parameters and reads usage from the last chunk', async () => {
    const { calls, impl } = mockFetch([() => sseResponse([
      { choices: [{ delta: { role: 'assistant', content: '' } }] },
      { choices: [{ delta: { content: 'Momentum is ' } }] },
      { choices: [{ delta: { content: 'mass × velocity.' }, finish_reason: 'stop' }], x_groq: { usage: { prompt_tokens: 812, completion_tokens: 40 } }, model: 'openai/gpt-oss-120b' },
    ])]);
    const deltas: string[] = [];
    const res = await groq(impl).streamChat({
      route, system: { stable: 'You are a tutor.', dynamic: 'Weak: momentum' }, maxTokens: 16000,
      turns: [{ role: 'user', text: 'What is momentum?' }], onText: (t) => deltas.push(t),
    });
    expect(res).toMatchObject({ text: 'Momentum is mass × velocity.', stopReason: 'end', usage: { inputTokens: 812, outputTokens: 40, model: 'openai/gpt-oss-120b' } });
    expect(deltas).toEqual(['Momentum is ', 'mass × velocity.']);
    const { url, headers, body } = calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(headers.Authorization).toBe('Bearer gsk_test');
    expect(body).toMatchObject({ model: 'openai/gpt-oss-120b', stream: true, reasoning_effort: 'medium', include_reasoning: false, stream_options: { include_usage: true } });
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens as number).toBeLessThanOrEqual(7500);
    expect((body.messages as Array<{ role: string; content: string }>)[0]).toEqual({ role: 'system', content: 'You are a tutor.\n\nWeak: momentum' });
  });

  it('sends images to the vision model', async () => {
    const { calls, impl } = mockFetch([() => sseResponse([{ choices: [{ delta: { content: 'I see a circuit.' }, finish_reason: 'stop' }] }])]);
    await groq(impl).streamChat({
      route, system: { stable: 's' }, maxTokens: 4000, onText: () => {},
      turns: [{ role: 'user', text: 'Explain this', attachments: [{ kind: 'image', mediaType: 'image/png', base64: 'iVBOR' }] }],
    });
    const body = calls[0].body as { model: string; reasoning_effort?: string; messages: Array<{ content: unknown }> };
    expect(body.model).toBe('qwen/qwen3.8-27b');
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.messages[1].content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBOR' } },
      { type: 'text', text: 'Explain this' },
    ]);
  });

  it('retries once on the fallback model when rate-limited', async () => {
    const { calls, impl } = mockFetch([
      () => new Response(JSON.stringify({ error: { code: 'rate_limit_exceeded' } }), { status: 429 }),
      () => sseResponse([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]),
    ]);
    const res = await groq(impl).streamChat({ route, system: { stable: 's' }, maxTokens: 2000, turns: [{ role: 'user', text: 'hi' }], onText: () => {} });
    expect(calls.map((c) => c.body.model)).toEqual(['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
    expect(res.text).toBe('ok');
  });

  it('reports a rate limit when the fallback is busy too', async () => {
    const busy = () => new Response('{}', { status: 429 });
    const { impl } = mockFetch([busy, busy]);
    await expect(groq(impl).streamChat({ route, system: { stable: 's' }, maxTokens: 2000, turns: [{ role: 'user', text: 'hi' }], onText: () => {} }))
      .rejects.toMatchObject({ code: 'busy' });
  });

  it('asks for strict JSON from gpt-oss and parses it', async () => {
    const { calls, impl } = mockFetch([() => Response.json({
      model: 'openai/gpt-oss-20b',
      choices: [{ finish_reason: 'stop', message: { content: '{"cards":[{"front":"F = ?","back":"ma"}]}' } }],
      usage: { prompt_tokens: 300, completion_tokens: 20 },
    })]);
    const res = await groq(impl).json({
      route: routeFor('flashcards', env({}), 'groq'), system: 'sys', prompt: 'cards', maxTokens: 8000,
      schema: FLASHCARD_SCHEMA as unknown as Record<string, unknown>,
    });
    expect(res.data).toEqual({ cards: [{ front: 'F = ?', back: 'ma' }] });
    expect(res.usage).toMatchObject({ inputTokens: 300, outputTokens: 20 });
    expect(calls[0].body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'result', strict: true, schema: FLASHCARD_SCHEMA } });
  });

  it('turns truncated or malformed JSON into errors', async () => {
    const r = routeFor('flashcards', env({}), 'groq');
    const opts = { route: r, system: 's', prompt: 'p', maxTokens: 1000, schema: {} };
    const cut = mockFetch([() => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{"ca' } }] })]);
    await expect(groq(cut.impl).json(opts)).rejects.toMatchObject({ code: 'bad_response' });
    const bad = mockFetch([() => Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'not json' } }] })]);
    await expect(groq(bad.impl).json(opts)).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('declines PDFs, which Groq cannot read', async () => {
    const { calls, impl } = mockFetch([]);
    await expect(groq(impl).json({
      route: routeFor('generate_questions', env({}), 'groq'), system: 's', prompt: 'p', maxTokens: 4000, schema: {},
      attachments: [{ kind: 'pdf', mediaType: 'application/pdf', base64: 'JVBER' }],
    })).rejects.toMatchObject({ code: 'unavailable' });
    expect(calls).toHaveLength(0);
  });

  it('needs its key', () => {
    expect(() => createGroqProvider(env({}))).toThrow(AIError);
    expect(createGroqProvider(env({ GROQ_API_KEY: 'gsk' })).name).toBe('groq');
  });
});

describe('OpenRouter provider', () => {
  it('routes only to providers that do not collect data, and sends PDFs as files', async () => {
    const { calls, impl } = mockFetch([() => Response.json({
      model: 'anthropic/claude-sonnet-5',
      choices: [{ finish_reason: 'stop', message: { content: '{"questions":[]}' } }],
      usage: { prompt_tokens: 5000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 0 } },
    })]);
    const provider = createCompatProvider({
      name: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-test', pdf: true, fetchImpl: impl,
      headers: { 'X-Title': 'Chapter' }, body: { provider: { data_collection: 'deny', require_parameters: true } },
    });
    await provider.json({
      route: routeFor('generate_questions', env({}), 'openrouter'), system: 's', prompt: 'p', maxTokens: 16000,
      schema: GENERATION_SCHEMA as unknown as Record<string, unknown>,
      attachments: [{ kind: 'pdf', mediaType: 'application/pdf', base64: 'JVBER' }],
    });
    const body = calls[0].body as Record<string, unknown> & { messages: Array<{ content: unknown }> };
    expect(body).toMatchObject({ model: 'anthropic/claude-sonnet-5', max_tokens: 16000, provider: { data_collection: 'deny' } });
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.messages[1].content).toEqual([
      { type: 'file', file: { filename: 'document.pdf', file_data: 'data:application/pdf;base64,JVBER' } },
      { type: 'text', text: 'p' },
    ]);
    expect(calls[0].headers['X-Title']).toBe('Chapter');
  });

  it('needs its key', () => {
    expect(() => createOpenRouterProvider(env({}))).toThrow(AIError);
    expect(createOpenRouterProvider(env({ OPENROUTER_API_KEY: 'sk-or' })).name).toBe('openrouter');
  });
});
