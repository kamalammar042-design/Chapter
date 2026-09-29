// Deno-side helpers: service client, caller identity, request scaffolding.
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import { bearerToken, corsHeaders, errorResponse, parseOrigins } from './http.ts';
import { estimateCost, type AiTask } from './ai/models.ts';
import type { Usage } from './ai/provider.ts';

export function env(name: string, required = true): string {
  const v = Deno.env.get(name) ?? '';
  if (required && !v) throw new Error(`missing environment variable ${name}`);
  return v;
}

let adminClient: SupabaseClient | null = null;

/** Service-role client. Bypasses RLS: every query must filter by the caller. */
export function admin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

/** Resolves the caller from their access token. Never trusts a body user id. */
export async function callerFrom(req: Request): Promise<User | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export interface Handler {
  (ctx: { req: Request; user: User; cors: Record<string, string> }): Promise<Response>;
}

/**
 * Wraps a POST handler with CORS, method checks, authentication and a
 * catch-all that never leaks internals to the client.
 */
export function serveAuthed(name: string, handler: Handler): void {
  const allowed = parseOrigins(Deno.env.get('ALLOWED_ORIGINS'));
  Deno.serve(async (req) => {
    const cors = corsHeaders(req.headers.get('Origin'), allowed);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return errorResponse('method_not_allowed', 405, cors);
    try {
      const user = await callerFrom(req);
      if (!user) return errorResponse('not_signed_in', 401, cors);
      return await handler({ req, user, cors });
    } catch (e) {
      log('error', 'unhandled', { fn: name, message: e instanceof Error ? e.message : String(e) });
      return errorResponse('server_error', 500, cors);
    }
  });
}

export async function readJson(req: Request, maxBytes: number): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get('Content-Length') ?? '0');
  if (len > maxBytes) return null;
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export interface UsageMeta {
  task?: AiTask;
  /** the routed model, used when the provider did not report one (e.g. failures) */
  model?: string;
  durationMs?: number;
  errorCode?: string;
}

/**
 * Records one AI request for quotas and the admin cost view. Never stores
 * prompts or replies. `kind` 'internal' rows (e.g. verification) do not count
 * against a student's allowance.
 */
export async function recordUsage(
  userId: string,
  kind: 'tutor_message' | 'generate' | 'internal',
  ok: boolean,
  usage?: Usage,
  meta: UsageMeta = {},
): Promise<void> {
  const model = usage?.model ?? meta.model ?? null;
  const { error } = await admin().from('ai_usage').insert({
    user_id: userId,
    kind,
    ok,
    input_tokens: usage?.inputTokens ?? 0,
    output_tokens: usage?.outputTokens ?? 0,
    cache_read_tokens: usage?.cacheReadTokens ?? 0,
    model,
    task: meta.task ?? null,
    duration_ms: meta.durationMs != null ? Math.round(meta.durationMs) : null,
    estimated_cost_usd: usage && model ? estimateCost(model, usage) : 0,
    error_code: meta.errorCode?.slice(0, 40) ?? null,
  });
  if (error) log('error', 'usage_record_failed', { message: error.message });
}

/**
 * Structured log line for the Supabase function logs. Pass only
 * operational fields: never tokens, keys, passwords or student content.
 */
export function log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
