// AIProvider for OpenAI-compatible chat APIs: Groq and OpenRouter.
//
// Configuration (Edge Function secrets):
//   GROQ_API_KEY        Groq (free tier; open-weight models)
//   OPENROUTER_API_KEY  OpenRouter (Claude models, paid from credit)
//   MODEL_* variables   see models.ts
//
// Plain fetch and no Deno globals, so the module also runs under Vitest.
// `fetchImpl` is injectable for tests.
import { AIError, type AIProvider, type Attachment, type ChatTurn, type StreamResult, type Usage } from './provider.ts';
import { GROQ_VISION_MODEL, validModel, type ModelRoute } from './models.ts';

export interface CompatConfig {
  name: 'groq' | 'openrouter';
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  /** extra top-level request fields (OpenRouter provider preferences) */
  body?: Record<string, unknown>;
  /** model used when a turn carries images and the routed model cannot read them */
  visionModel?: string;
  /** whether PDFs can be sent as file parts */
  pdf: boolean;
  /**
   * Per-request token budget (prompt + max output). Groq's free tier limits
   * each model to 8,000 tokens a minute, so requests are sized to fit.
   */
  tokenBudget?: number;
  /** tried once when the routed model is rate-limited or overloaded */
  fallbackModel?: string;
  fetchImpl?: typeof fetch;
}

type Part =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | Part[];
}

/** Rough token estimate (4 characters a token; images at Groq's 2,048). */
export function estimateTokens(messages: Message[]): number {
  let chars = 0;
  let images = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') chars += m.content.length;
    else for (const p of m.content) {
      if (p.type === 'text') chars += p.text.length;
      else images += 1;
    }
  }
  return Math.ceil(chars / 4) + images * 2048 + messages.length * 4;
}

export function toParts(text: string, attachments: Attachment[] = [], pdf: boolean): Part[] {
  const parts: Part[] = [];
  for (const a of attachments) {
    if (a.kind === 'pdf') {
      if (!pdf) throw new AIError('unavailable', 'this AI provider cannot read documents');
      parts.push({ type: 'file', file: { filename: 'document.pdf', file_data: `data:application/pdf;base64,${a.base64}` } });
    } else {
      parts.push({ type: 'image_url', image_url: { url: `data:${a.mediaType};base64,${a.base64}` } });
    }
  }
  parts.push({ type: 'text', text: text || '(see attachment)' });
  return parts;
}

/**
 * Drops the oldest turns (keeping the latest user turn) until the prompt
 * fits the budget with room for the reply, and returns the output limit
 * that remains. Throws when even the latest turn does not fit.
 */
export function fitToBudget(system: Message[], turns: Message[], maxTokens: number, budget?: number): { turns: Message[]; maxTokens: number } {
  if (!budget) return { turns, maxTokens };
  const kept = [...turns];
  const minReply = Math.min(maxTokens, 1024);
  while (kept.length > 1 && estimateTokens([...system, ...kept]) + minReply > budget) {
    kept.shift();
    // the conversation must still start with the student
    while (kept.length > 1 && kept[0].role !== 'user') kept.shift();
  }
  const room = budget - estimateTokens([...system, ...kept]);
  if (room < minReply) throw new AIError('bad_response', 'request too large for this AI provider');
  return { turns: kept, maxTokens: Math.min(maxTokens, room) };
}

/** Strict JSON schemas need every property required and no extra properties. */
export function strictCompatible(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') return true;
  const s = schema as Record<string, unknown>;
  if (s.type === 'object' || s.properties) {
    const props = Object.keys((s.properties as Record<string, unknown>) ?? {});
    const required = (s.required as string[]) ?? [];
    if (s.additionalProperties !== false || props.some((p) => !required.includes(p))) return false;
  }
  for (const key of ['minItems', 'maxItems', 'minLength', 'maxLength', 'pattern', 'format', 'minimum', 'maximum']) {
    if (key in s) return false;
  }
  const children = [
    ...Object.values((s.properties as Record<string, unknown>) ?? {}),
    s.items,
    ...((s.anyOf as unknown[]) ?? []),
  ];
  return children.every(strictCompatible);
}

export function mapStatus(status: number, detail = ''): AIError {
  if (status === 401 || status === 403) return new AIError('misconfigured', 'provider credentials rejected');
  if (status === 402) return new AIError('unavailable', 'provider credit exhausted');
  if (status === 413) return new AIError('bad_response', 'request too large for this AI provider');
  if (status === 429) return new AIError('busy', 'rate limited', true);
  if (status === 408 || status === 504) return new AIError('timeout', 'timed out', true);
  if (status === 400 || status === 422) return new AIError('bad_response', `bad request ${detail}`.trim());
  if (status >= 500) return new AIError('busy', 'provider overloaded', true);
  return new AIError('unavailable', `provider error ${status}`);
}

/** Splits an SSE byte stream into the JSON payloads of its data lines. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, '');
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue; // comments (": OPENROUTER PROCESSING"), events, blank lines
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        yield JSON.parse(data);
      } catch {
        // partial or non-JSON keep-alive line
      }
    }
    if (done) break;
  }
}

function usageOf(raw: unknown, model: string): Usage {
  const u = (raw ?? {}) as Record<string, number | Record<string, number>>;
  const details = (u.prompt_tokens_details ?? {}) as Record<string, number>;
  return {
    inputTokens: Number(u.prompt_tokens ?? 0),
    outputTokens: Number(u.completion_tokens ?? 0),
    cacheReadTokens: Number(details.cached_tokens ?? 0),
    cacheWriteTokens: 0,
    model,
  };
}

function stopOf(reason: unknown): StreamResult['stopReason'] {
  if (reason === 'stop') return 'end';
  if (reason === 'length') return 'max_tokens';
  if (reason === 'content_filter') return 'refusal';
  return 'other';
}

export function createCompatProvider(cfg: CompatConfig): AIProvider {
  const doFetch = cfg.fetchImpl ?? fetch;

  function params(route: ModelRoute, model: string, maxTokens: number): Record<string, unknown> {
    const p: Record<string, unknown> = { ...cfg.body, model, max_tokens: maxTokens };
    if (cfg.name === 'groq') {
      delete p.max_tokens;
      p.max_completion_tokens = maxTokens;
      if (route.effort && /gpt-oss/.test(model)) {
        p.reasoning_effort = route.effort;
        p.include_reasoning = false;
      }
    }
    return p;
  }

  /** POSTs a chat completion, retrying once on the fallback model when busy. */
  async function post(model: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<{ res: Response; model: string }> {
    const attempt = (m: string) => doFetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}`, ...cfg.headers },
      body: JSON.stringify({ ...body, model: m }),
      signal,
    });
    let res: Response;
    try {
      res = await attempt(model);
      if ((res.status === 429 || res.status === 503) && cfg.fallbackModel && cfg.fallbackModel !== model) {
        await res.body?.cancel();
        model = cfg.fallbackModel;
        res = await attempt(model);
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw new AIError('timeout', 'aborted');
      throw new AIError('unavailable', 'provider unreachable', true);
    }
    if (!res.ok) {
      let detail = '';
      try {
        const j = await res.json() as { error?: { code?: string; type?: string } };
        detail = String(j?.error?.code ?? j?.error?.type ?? '').slice(0, 60);
      } catch { /* no body */ }
      throw mapStatus(res.status, detail);
    }
    return { res, model };
  }

  return {
    name: cfg.name,

    async streamChat({ route, system, turns, maxTokens, signal, onText }): Promise<StreamResult> {
      const hasImages = turns.some((t) => t.attachments?.some((a) => a.kind === 'image'));
      const model = hasImages && cfg.visionModel ? cfg.visionModel : route.model;
      const sys: Message[] = [{ role: 'system', content: [system.stable, system.dynamic].filter(Boolean).join('\n\n') }];
      const msgs: Message[] = turns.map((t: ChatTurn) => ({
        role: t.role,
        content: t.role === 'user' && t.attachments?.length ? toParts(t.text, t.attachments, cfg.pdf) : t.text,
      }));
      const fit = fitToBudget(sys, msgs, maxTokens, cfg.tokenBudget);
      const body = {
        ...params(route, model, fit.maxTokens),
        messages: [...sys, ...fit.turns],
        stream: true,
        stream_options: { include_usage: true },
      };
      const { res, model: served } = await post(model, body, signal);
      let text = '';
      let finish: unknown = null;
      let usage: Usage = usageOf(null, served);
      try {
        for await (const chunk of sseData(res.body!)) {
          if (chunk.error) throw mapStatus(Number((chunk.error as { code?: number }).code) || 500);
          const choice = (chunk.choices as Array<Record<string, unknown>> | undefined)?.[0];
          const delta = (choice?.delta as { content?: string } | undefined)?.content;
          if (delta) {
            text += delta;
            onText(delta);
          }
          if (choice?.finish_reason) finish = choice.finish_reason;
          const u = chunk.usage ?? (chunk.x_groq as { usage?: unknown } | undefined)?.usage;
          if (u) usage = usageOf(u, String(chunk.model ?? served));
        }
      } catch (e) {
        if (e instanceof AIError) throw e;
        if (e instanceof Error && e.name === 'AbortError') throw new AIError('timeout', 'aborted');
        throw new AIError('unavailable', 'stream interrupted', true);
      }
      return { text, usage, stopReason: stopOf(finish) };
    },

    async json({ route, system, prompt, schema, attachments, maxTokens, signal }) {
      const hasImages = attachments?.some((a) => a.kind === 'image');
      const model = hasImages && cfg.visionModel ? cfg.visionModel : route.model;
      const sys: Message[] = [{ role: 'system', content: system }];
      const user: Message[] = [{ role: 'user', content: attachments?.length ? toParts(prompt, attachments, cfg.pdf) : prompt }];
      const fit = fitToBudget(sys, user, maxTokens, cfg.tokenBudget);
      const strict = strictCompatible(schema) && (cfg.name === 'openrouter' || /gpt-oss/.test(model));
      const body = {
        ...params(route, model, fit.maxTokens),
        messages: [...sys, ...fit.turns],
        response_format: { type: 'json_schema', json_schema: { name: 'result', strict, schema } },
      };
      const { res, model: served } = await post(model, body, signal);
      let j: Record<string, unknown>;
      try {
        j = await res.json();
      } catch {
        throw new AIError('bad_response', 'response was not JSON');
      }
      const choice = (j.choices as Array<Record<string, unknown>> | undefined)?.[0];
      if (choice?.finish_reason === 'content_filter') throw new AIError('refused', 'model declined');
      if (choice?.finish_reason === 'length') throw new AIError('bad_response', 'response truncated');
      const message = (choice?.message ?? {}) as { content?: string; refusal?: string };
      if (message.refusal) throw new AIError('refused', 'model declined');
      let data: unknown;
      try {
        data = JSON.parse(String(message.content ?? '').replace(/^```(?:json)?\s*|\s*```$/g, ''));
      } catch {
        throw new AIError('bad_response', 'response was not valid JSON');
      }
      return { data, usage: usageOf(j.usage, String(j.model ?? served)) };
    },
  };
}

export function createGroqProvider(getEnv: (k: string) => string | undefined): AIProvider {
  const apiKey = getEnv('GROQ_API_KEY')?.trim();
  if (!apiKey) throw new AIError('misconfigured', 'GROQ_API_KEY is not set');
  const budget = Number(getEnv('GROQ_TOKEN_BUDGET'));
  return createCompatProvider({
    name: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey,
    visionModel: validModel('groq', getEnv('MODEL_VISION')) ?? GROQ_VISION_MODEL,
    pdf: false,
    // free tier: 8,000 tokens a minute per model; set higher on a paid plan
    tokenBudget: Number.isFinite(budget) && budget >= 2000 ? budget : 7500,
    fallbackModel: 'openai/gpt-oss-20b',
  });
}

export function createOpenRouterProvider(getEnv: (k: string) => string | undefined): AIProvider {
  const apiKey = getEnv('OPENROUTER_API_KEY')?.trim();
  if (!apiKey) throw new AIError('misconfigured', 'OPENROUTER_API_KEY is not set');
  return createCompatProvider({
    name: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey,
    headers: { 'HTTP-Referer': getEnv('SITE_URL') || 'https://chapter-sepia-omega.vercel.app', 'X-Title': 'Chapter' },
    // only route to providers that do not keep prompts for training
    body: { provider: { data_collection: 'deny', require_parameters: true } },
    pdf: true,
  });
}
