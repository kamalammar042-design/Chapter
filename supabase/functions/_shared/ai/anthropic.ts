// Anthropic implementation of AIProvider (Deno runtime).
//
// Configuration (Edge Function secrets):
//   ANTHROPIC_API_KEY   required
//   MODEL_* variables   see models.ts (each request carries its route)
import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';
import { AIError, type AIProvider, type Attachment, type ChatTurn, type StreamResult, type Usage } from './provider.ts';
import type { ModelRoute } from './models.ts';

function toContent(text: string, attachments: Attachment[] = []): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const a of attachments) {
    if (a.kind === 'pdf') {
      blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.base64 } });
    } else {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: a.mediaType as 'image/png', data: a.base64 },
      });
    }
  }
  blocks.push({ type: 'text', text: text || '(see attachment)' });
  return blocks;
}

function mapError(e: unknown): AIError {
  if (e instanceof AIError) return e;
  if (e instanceof Anthropic.RateLimitError) return new AIError('busy', 'rate limited', true);
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new AIError('timeout', 'timed out', true);
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new AIError('misconfigured', 'provider credentials rejected');
  }
  if (e instanceof Anthropic.BadRequestError) return new AIError('bad_response', `bad request: ${e.message}`);
  if (e instanceof Anthropic.InternalServerError) return new AIError('busy', 'provider overloaded', true);
  if (e instanceof Anthropic.APIConnectionError) return new AIError('unavailable', 'provider unreachable', true);
  if (e instanceof Anthropic.APIError) return new AIError('unavailable', `provider error ${e.status}`);
  if (e instanceof Error && e.name === 'AbortError') return new AIError('timeout', 'aborted');
  return new AIError('unavailable', 'unexpected provider error');
}

/** Request parameters that depend on the routed model. */
function modelParams(route: ModelRoute, format?: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = { model: route.model };
  const output: Record<string, unknown> = {};
  if (route.thinking) p.thinking = { type: 'adaptive' };
  if (route.effort) output.effort = route.effort;
  if (format) output.format = format;
  if (Object.keys(output).length) p.output_config = output;
  if (route.fallbacks) {
    p.betas = ['server-side-fallback-2026-07-01'];
    p.fallbacks = 'default';
  }
  return p;
}

function usageOf(u: Anthropic.Beta.Messages.BetaUsage | Anthropic.Usage, model: string): Usage {
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    model,
  };
}

export function createAnthropicProvider(): AIProvider {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new AIError('misconfigured', 'ANTHROPIC_API_KEY is not set');
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });

  return {
    name: 'anthropic',

    async streamChat({ route, system, turns, maxTokens, signal, onText }): Promise<StreamResult> {
      const systemBlocks: Anthropic.TextBlockParam[] = [
        { type: 'text', text: system.stable, cache_control: { type: 'ephemeral' } },
      ];
      if (system.dynamic) systemBlocks.push({ type: 'text', text: system.dynamic });

      const messages = turns.map((t: ChatTurn) => ({
        role: t.role,
        content: t.role === 'user' ? toContent(t.text, t.attachments) : t.text,
      }));

      try {
        // The beta namespace carries the fallback parameters; the request is
        // otherwise a standard streaming Messages call.
        const stream = client.beta.messages.stream(
          { ...modelParams(route), max_tokens: maxTokens, system: systemBlocks, messages } as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming,
          { signal },
        );
        let text = '';
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            text += event.delta.text;
            onText(event.delta.text);
          }
        }
        const final = await stream.finalMessage();
        const stop = final.stop_reason;
        return {
          text,
          usage: usageOf(final.usage, final.model ?? route.model),
          stopReason: stop === 'end_turn' ? 'end' : stop === 'max_tokens' ? 'max_tokens' : stop === 'refusal' ? 'refusal' : 'other',
        };
      } catch (e) {
        throw mapError(e);
      }
    },

    async json({ route, system, prompt, schema, attachments, maxTokens, signal }) {
      try {
        const res = await client.beta.messages.create(
          {
            ...modelParams(route, { type: 'json_schema', schema }),
            max_tokens: maxTokens,
            system,
            messages: [{ role: 'user', content: toContent(prompt, attachments) }],
          } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
          { signal },
        );
        if (res.stop_reason === 'refusal') throw new AIError('refused', 'model declined');
        if (res.stop_reason === 'max_tokens') throw new AIError('bad_response', 'response truncated');
        const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          throw new AIError('bad_response', 'response was not valid JSON');
        }
        return { data, usage: usageOf(res.usage, res.model ?? route.model) };
      } catch (err) {
        throw mapError(err);
      }
    },
  };
}
