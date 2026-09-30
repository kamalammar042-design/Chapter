// Review reminder messages and OneSignal response handling (pure; unit-tested).
// The notification says only how many skills are due: no subject, skill
// names, answers or anything else from the student's account.

export interface ReminderMessage {
  headings: { en: string };
  contents: { en: string };
  web_url: string;
}

export function reminderMessage(dueCount: number, siteUrl: string): ReminderMessage {
  const n = Math.max(1, Math.floor(dueCount));
  const skills = n === 1 ? '1 skill is' : `${n} skills are`;
  return {
    headings: { en: 'Time for a quick review' },
    contents: { en: `${skills} ready to review. A few minutes now keeps them fresh.` },
    web_url: `${siteUrl.replace(/\/$/, '')}/review`,
  };
}

/**
 * A stable UUID for one student's reminder on one local day, used as
 * OneSignal's idempotency_key so a retried run never sends twice.
 */
export async function reminderKey(userId: string, localDate: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`review-reminder:${userId}:${localDate}`)));
  const b = bytes.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4 layout
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Subscription ids OneSignal says it could not deliver to (unsubscribed or
 * unknown), from any of the shapes its `errors` field takes.
 */
export function deadSubscriptions(errors: unknown, sent: string[]): string[] {
  const found = new Set<string>();
  const visit = (v: unknown) => {
    if (typeof v === 'string') { if (sent.includes(v)) found.add(v); }
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  if (errors && typeof errors === 'object' && !Array.isArray(errors)) visit(errors);
  return [...found];
}
