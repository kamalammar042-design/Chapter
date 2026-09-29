// ============================================================
// AI provider abstraction
// ------------------------------------------------------------
// Edge Functions talk to this interface, never to a vendor SDK directly,
// so the model provider can be swapped (or a second one added) without
// touching tutor or generation logic. Pure types + error class.
// ============================================================
import type { ModelRoute } from './models.ts';

export interface Attachment {
  kind: 'image' | 'pdf';
  mediaType: string;
  base64: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  attachments?: Attachment[];
}

export interface SystemPrompt {
  /** identical across requests; cached by providers that support it */
  stable: string;
  /** per-student / per-turn */
  dynamic?: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** the model that served the request */
  model?: string;
}

export interface StreamResult {
  text: string;
  usage: Usage;
  stopReason: 'end' | 'max_tokens' | 'refusal' | 'other';
}

export interface AIProvider {
  readonly name: string;
  /** Streams a tutor reply, calling onText for each text fragment. */
  streamChat(opts: {
    route: ModelRoute;
    system: SystemPrompt;
    turns: ChatTurn[];
    maxTokens: number;
    signal?: AbortSignal;
    onText: (delta: string) => void;
  }): Promise<StreamResult>;

  /** One-shot request constrained to a JSON schema. Returns parsed JSON. */
  json(opts: {
    route: ModelRoute;
    system: string;
    prompt: string;
    schema: Record<string, unknown>;
    attachments?: Attachment[];
    maxTokens: number;
    signal?: AbortSignal;
  }): Promise<{ data: unknown; usage: Usage }>;
}

export type AIErrorCode = 'unavailable' | 'busy' | 'timeout' | 'refused' | 'bad_response' | 'misconfigured';

export class AIError extends Error {
  constructor(readonly code: AIErrorCode, message: string, readonly retryable = false) {
    super(message);
    this.name = 'AIError';
  }
}

/** Maps provider errors to the HTTP error codes the client understands. */
export function aiErrorToHttp(code: AIErrorCode): { error: 'ai_unavailable' | 'ai_busy' | 'ai_timeout' | 'ai_refused' | 'ai_bad_response'; status: number } {
  switch (code) {
    case 'busy': return { error: 'ai_busy', status: 503 };
    case 'timeout': return { error: 'ai_timeout', status: 504 };
    case 'refused': return { error: 'ai_refused', status: 422 };
    case 'bad_response': return { error: 'ai_bad_response', status: 502 };
    default: return { error: 'ai_unavailable', status: 503 };
  }
}
