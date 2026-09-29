// ============================================================
// Model routing and cost estimation (pure; unit-tested)
// ------------------------------------------------------------
// Each AI task goes to the cheapest model that does it well:
//   MODEL_TUTOR       everyday tutoring: chat, explain, hint, simplify
//   MODEL_TUTOR_DEEP  careful reasoning: check my work, explain my mistake,
//                     study plans, scanned questions
//   MODEL_GENERATE    writing new practice questions
//   MODEL_VERIFY      independently solving generated questions
//   MODEL_LIGHT       small jobs: memory notes, flashcards, notes
// Every variable is optional; the defaults below apply when unset.
// ============================================================

export type AiTask =
  | 'tutor_chat' | 'tutor_explain' | 'tutor_hint' | 'tutor_simplify' | 'tutor_practice'
  | 'tutor_check' | 'tutor_mistake' | 'tutor_plan' | 'tutor_scan'
  | 'generate_questions' | 'verify_questions'
  | 'flashcards' | 'notes' | 'memory';

export type Effort = 'low' | 'medium' | 'high';

export interface ModelRoute {
  task: AiTask;
  model: string;
  /** null for models that do not take an effort setting */
  effort: Effort | null;
  /** adaptive thinking is sent only to models that support it */
  thinking: boolean;
  /** server-side refusal fallback (Opus 5 / Fable 5 families only) */
  fallbacks: boolean;
}

export const DEFAULT_MODELS = {
  MODEL_TUTOR: 'claude-sonnet-5',
  MODEL_TUTOR_DEEP: 'claude-opus-5',
  MODEL_GENERATE: 'claude-sonnet-5',
  MODEL_VERIFY: 'claude-opus-5',
  MODEL_LIGHT: 'claude-haiku-4-5',
} as const;

type ModelVar = keyof typeof DEFAULT_MODELS;

const TASKS: Record<AiTask, { model: ModelVar; effort: Effort }> = {
  tutor_chat: { model: 'MODEL_TUTOR', effort: 'medium' },
  tutor_explain: { model: 'MODEL_TUTOR', effort: 'medium' },
  tutor_hint: { model: 'MODEL_TUTOR', effort: 'low' },
  tutor_simplify: { model: 'MODEL_TUTOR', effort: 'low' },
  tutor_practice: { model: 'MODEL_TUTOR', effort: 'medium' },
  tutor_check: { model: 'MODEL_TUTOR_DEEP', effort: 'medium' },
  tutor_mistake: { model: 'MODEL_TUTOR_DEEP', effort: 'medium' },
  tutor_plan: { model: 'MODEL_TUTOR_DEEP', effort: 'medium' },
  tutor_scan: { model: 'MODEL_TUTOR_DEEP', effort: 'medium' },
  generate_questions: { model: 'MODEL_GENERATE', effort: 'medium' },
  verify_questions: { model: 'MODEL_VERIFY', effort: 'low' },
  flashcards: { model: 'MODEL_LIGHT', effort: 'low' },
  notes: { model: 'MODEL_LIGHT', effort: 'low' },
  memory: { model: 'MODEL_LIGHT', effort: 'low' },
};

const MODEL_ID = /^claude-[a-z0-9.-]{3,60}$/;

/** Haiku 4.5 and older models take neither adaptive thinking nor effort. */
export function supportsAdaptive(model: string): boolean {
  return /^claude-(opus|sonnet|fable|mythos)-(5|4-[6-9])/.test(model);
}

export function supportsFallbacks(model: string): boolean {
  return /^claude-(opus-5|fable-5)/.test(model);
}

/**
 * The model for a task. `getEnv` reads configuration (Deno.env.get in
 * functions). TUTOR_MODEL / TUTOR_EFFORT from earlier versions are still
 * honoured for the everyday tutor.
 */
export function routeFor(task: AiTask, getEnv: (name: string) => string | undefined): ModelRoute {
  const t = TASKS[task];
  const legacy = t.model === 'MODEL_TUTOR' ? getEnv('TUTOR_MODEL') : undefined;
  const configured = getEnv(t.model) || legacy || '';
  const model = MODEL_ID.test(configured) ? configured : DEFAULT_MODELS[t.model];
  const effortVar = getEnv(`${t.model}_EFFORT`) || (t.model === 'MODEL_TUTOR' ? getEnv('TUTOR_EFFORT') : undefined);
  const effort = effortVar === 'low' || effortVar === 'medium' || effortVar === 'high' ? effortVar : t.effort;
  const adaptive = supportsAdaptive(model);
  return { task, model, effort: adaptive ? effort : null, thinking: adaptive, fallbacks: supportsFallbacks(model) };
}

/** US dollars per million tokens. Unknown models are costed as Opus 5. */
export const PRICES: Array<{ prefix: string; input: number; output: number; cacheRead: number }> = [
  { prefix: 'claude-fable-5', input: 10, output: 50, cacheRead: 1 },
  { prefix: 'claude-opus-5-5', input: 4, output: 20, cacheRead: 0.2 },
  { prefix: 'claude-opus-5', input: 5, output: 25, cacheRead: 0.5 },
  { prefix: 'claude-opus-4', input: 5, output: 25, cacheRead: 0.5 },
  { prefix: 'claude-sonnet-5', input: 2, output: 10, cacheRead: 0.2 },
  { prefix: 'claude-sonnet-4', input: 3, output: 15, cacheRead: 0.3 },
  { prefix: 'claude-haiku-4-5', input: 1, output: 5, cacheRead: 0.1 },
];

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** Estimated cost of one request, rounded to 1/100,000 of a dollar. */
export function estimateCost(model: string, u: TokenUsage): number {
  const p = PRICES.find((x) => model.startsWith(x.prefix)) ?? PRICES[2];
  const cost = (u.inputTokens * p.input + (u.cacheWriteTokens ?? 0) * p.input * 1.25
    + (u.cacheReadTokens ?? 0) * p.cacheRead + u.outputTokens * p.output) / 1_000_000;
  return Math.round(cost * 100_000) / 100_000;
}
