// Chooses the AI provider from Edge Function secrets (see models.ts).
import { AIError, type AIProvider } from './provider.ts';
import { providerKind, type ProviderKind } from './models.ts';
import { createAnthropicProvider } from './anthropic.ts';
import { createGroqProvider, createOpenRouterProvider } from './openai-compat.ts';

const env = (k: string) => Deno.env.get(k);

/** The configured provider. Throws AIError('misconfigured') when none is set. */
export function createProvider(): { provider: AIProvider; kind: ProviderKind } {
  const kind = providerKind(env);
  if (!kind) throw new AIError('misconfigured', 'no AI provider key is set');
  if (kind === 'groq') return { provider: createGroqProvider(env), kind };
  if (kind === 'openrouter') return { provider: createOpenRouterProvider(env), kind };
  return { provider: createAnthropicProvider(), kind };
}
