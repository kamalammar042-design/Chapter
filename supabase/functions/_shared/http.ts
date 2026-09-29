// HTTP helpers shared by every Edge Function. Pure: no Deno APIs, so the
// logic is unit-tested under Node as well.

/**
 * CORS headers for a request. `allowed` comes from the ALLOWED_ORIGINS
 * secret (comma-separated). When it is empty every origin is allowed; that
 * is safe here because requests authenticate with a bearer token, never
 * cookies, but production should still set the list.
 */
export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const base = {
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowed.length === 0) return { ...base, 'Access-Control-Allow-Origin': '*' };
  if (origin && allowed.includes(origin)) return { ...base, 'Access-Control-Allow-Origin': origin };
  return base;
}

export function parseOrigins(value: string | undefined | null): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/** Error codes the client maps to human messages. Never raw internals. */
export type ErrorCode =
  | 'method_not_allowed'
  | 'not_signed_in'
  | 'invalid_request'
  | 'forbidden'
  | 'not_found'
  | 'upgrade_required'
  | 'monthly_cap_reached'
  | 'slow_down'
  | 'ai_unavailable'
  | 'ai_busy'
  | 'ai_timeout'
  | 'ai_refused'
  | 'ai_bad_response'
  | 'conflict'
  | 'server_error';

export function jsonResponse(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function errorResponse(
  code: ErrorCode,
  status: number,
  headers: Record<string, string>,
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse({ ok: false, error: code, ...extra }, status, headers);
}

export function bearerToken(req: Request): string | null {
  const h = req.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/** Server-sent event frame. */
export function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SUBJECT_KEY_RE = /^[a-z0-9_.-]{2,40}$/;
export const TOPIC_KEY_RE = /^[a-z0-9-]{1,48}$/;
