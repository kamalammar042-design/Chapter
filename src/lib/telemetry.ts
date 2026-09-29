// Privacy-safe error reporting. Sends what failed and where, never what the
// student typed: messages are truncated and scrubbed of anything that looks
// like an email address, token or long number. The server stores a one-way
// hash of the user id and drops floods (see log_client_event in 015).
import { supabase } from './supabase';
import { env } from './env';

const VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '2.0.0';

/** Removes personal data patterns from a message. */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}\b/g, '[token]')
    .replace(/\b(sk|pk|rk)_(live|test)_[\w]{8,}\b/g, '[key]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/\b\d{6,}\b/g, '[number]')
    .slice(0, 300);
}

/** Route without ids, e.g. /tutor/[id]. */
export function scrubRoute(path: string): string {
  return path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[id]').split('?')[0].slice(0, 200);
}

let sent = 0;

export function reportError(event: string, error: unknown, level: 'error' | 'warn' = 'error'): void {
  if (!env.isConfigured || sent >= 20) return;
  sent++;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : typeof error === 'string' ? error : 'unknown';
  void supabase.rpc('log_client_event', {
    p_level: level,
    p_event: event.slice(0, 80),
    p_route: scrubRoute(typeof location !== 'undefined' ? location.pathname : ''),
    p_message: scrub(message),
    p_detail: null,
    p_version: VERSION,
  }).then(() => undefined, () => undefined);
}

/** Global handlers for errors nothing else caught. */
export function installErrorReporting(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => reportError('window_error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as { name?: string } | undefined;
    if (reason?.name === 'AbortError') return;
    reportError('unhandled_rejection', e.reason);
  });
}
