// Link-check policy for the official-source directory (pure; unit-tested).
// One polite request per link: no crawling, no retries in a tight loop, and
// no attempt to get past logins, paywalls or bot protection. A page that
// blocks automated checks is left as it is rather than marked broken.

export type LinkOutcome = 'ok' | 'broken' | 'blocked' | 'transient';

export function classifyLink(status: number | null, networkError = false): LinkOutcome {
  if (networkError || status == null) return 'transient';
  if (status >= 200 && status < 400) return 'ok';
  if (status === 404 || status === 410) return 'broken';
  // 401/403/429 and bot challenges: the page exists but refuses automated checks
  if (status === 401 || status === 403 || status === 429 || status === 999) return 'blocked';
  if (status >= 500) return 'transient';
  return 'broken';
}

export const FAILURES_BEFORE_UNAVAILABLE = 2;

/** New status and failure count for a resource after one check. */
export function nextLinkState(
  current: { status: 'active' | 'unavailable' | 'pending'; consecutive_failures: number },
  outcome: LinkOutcome,
): { status: 'active' | 'unavailable' | 'pending'; consecutive_failures: number } {
  if (current.status === 'pending') return current; // awaiting a person, never auto-published
  if (outcome === 'ok') return { status: 'active', consecutive_failures: 0 };
  if (outcome === 'broken') {
    const n = current.consecutive_failures + 1;
    return { status: n >= FAILURES_BEFORE_UNAVAILABLE ? 'unavailable' : current.status, consecutive_failures: n };
  }
  return current;
}
