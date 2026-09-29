// Turns anything thrown by Supabase, fetch or our Edge Functions into a
// message a student can act on. Raw error text is never shown.

export type AppErrorCode =
  | 'offline'
  | 'not_signed_in'
  | 'session_expired'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'free_limit_reached'
  | 'rate_limited'
  | 'upgrade_required'
  | 'monthly_cap_reached'
  | 'slow_down'
  | 'ai_unavailable'
  | 'ai_busy'
  | 'ai_timeout'
  | 'ai_refused'
  | 'ai_bad_response'
  | 'not_configured'
  | 'conflict'
  | 'unknown';

export class AppError extends Error {
  constructor(readonly code: AppErrorCode, message?: string, readonly detail?: unknown) {
    super(message ?? messageFor(code));
    this.name = 'AppError';
  }
}

const MESSAGES: Record<AppErrorCode, string> = {
  offline: "You're offline. Check your connection and try again.",
  not_signed_in: 'Please sign in to continue.',
  session_expired: 'Your session has expired. Please sign in again.',
  forbidden: "You don't have access to that.",
  not_found: "We couldn't find that. It may have been deleted.",
  invalid_request: "Something about that request wasn't right. Please check and try again.",
  free_limit_reached: "You've used this month's free questions. They reset on the 1st.",
  rate_limited: "You're answering very quickly. Take a breath and try again in a minute.",
  upgrade_required: 'This is part of a paid plan.',
  monthly_cap_reached: "You've reached this month's limit for this feature.",
  slow_down: 'Too many requests at once. Wait a few seconds and try again.',
  ai_unavailable: "The tutor isn't available right now. Please try again shortly.",
  ai_busy: 'The tutor is very busy right now. Please try again in a moment.',
  ai_timeout: 'The tutor took too long to respond. Please try again.',
  ai_refused: "The tutor couldn't help with that request. Try rephrasing it as a study question.",
  ai_bad_response: "The tutor's response didn't come through properly. Please try again.",
  not_configured: "Chapter isn't connected to its server yet.",
  conflict: 'That already exists.',
  unknown: 'Something went wrong. Please try again.',
};

export function messageFor(code: AppErrorCode): string {
  return MESSAGES[code];
}

const KNOWN = new Set(Object.keys(MESSAGES));

/** Normalises any error to an AppError. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new AppError('offline');

  const err = e as { message?: string; code?: string; status?: number; name?: string; error?: string } | null;
  const msg = String(err?.message ?? err?.error ?? '');

  // Postgres exceptions raised by our functions carry the code as the message.
  for (const code of ['free_limit_reached', 'rate_limited', 'upgrade_required', 'not_authenticated', 'too_many_parents', 'students_only']) {
    if (msg.includes(code)) {
      if (code === 'not_authenticated') return new AppError('session_expired');
      if (code === 'too_many_parents') return new AppError('forbidden', 'You can link up to four parent accounts.');
      if (code === 'students_only') return new AppError('forbidden', 'Only student accounts can do this.');
      return new AppError(code as AppErrorCode);
    }
  }
  if (/question_not_found|deck_not_found/.test(msg)) return new AppError('not_found');
  if (/invalid_answer|invalid_request|invalid_session/.test(msg)) return new AppError('invalid_request');
  if (err?.error && KNOWN.has(err.error)) return new AppError(err.error as AppErrorCode);
  if (err?.code === '23505') return new AppError('conflict');
  if (err?.code === '42501' || err?.status === 403) return new AppError('forbidden');
  if (err?.code === 'PGRST301' || err?.status === 401 || /jwt/i.test(msg)) return new AppError('session_expired');
  if (err?.code === 'PGRST116' || err?.status === 404) return new AppError('not_found');
  if (err?.name === 'TypeError' && /fetch|network|load failed/i.test(msg)) return new AppError('offline');
  if (/failed to fetch|networkerror|network request failed/i.test(msg)) return new AppError('offline');
  return new AppError('unknown', undefined, e);
}

export function errorMessage(e: unknown): string {
  return toAppError(e).message;
}

/** Auth errors: deliberately generic where specifics would enable enumeration. */
export function authErrorMessage(e: unknown, context: 'signin' | 'signup' | 'reset' | 'update'): string {
  const err = e as { message?: string; code?: string; status?: number } | null;
  const msg = String(err?.message ?? '').toLowerCase();
  const code = String(err?.code ?? '');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return messageFor('offline');
  if (/failed to fetch|network/i.test(msg)) return messageFor('offline');
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || err?.status === 429) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (context === 'signin') {
    if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
      return 'Please confirm your email first. Check your inbox for the link we sent.';
    }
    return 'That email and password combination is not right.';
  }
  if (code === 'weak_password' || msg.includes('password')) {
    return 'Choose a stronger password: at least 8 characters with letters and numbers.';
  }
  if (context === 'signup' && (code === 'user_already_exists' || msg.includes('already registered'))) {
    // Supabase normally hides this; if it surfaces, stay non-committal.
    return 'We could not create that account. If you already have one, try signing in.';
  }
  if (code === 'same_password') return 'Your new password must be different from the old one.';
  if (msg.includes('invalid email') || code === 'email_address_invalid') return 'Please enter a valid email address.';
  return messageFor('unknown');
}
