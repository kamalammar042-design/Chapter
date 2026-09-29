// Date helpers. Study days are calendar days in the student's own time
// zone (the database uses the same rule), represented as 'YYYY-MM-DD'.

export type Day = string;

/** Today's date in a time zone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now: Date = new Date()): Day {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function toUtc(day: Day): number {
  return Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
}

export function addDays(day: Day, n: number): Day {
  return new Date(toUtc(day) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: Day, b: Day): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** Monday of the week containing `day`. */
export function weekStart(day: Day): Day {
  const dow = new Date(toUtc(day)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

/** Inclusive list of days from start to end. */
export function dayRange(start: Day, end: Day): Day[] {
  const out: Day[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatDay(day: Day, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' }).format(new Date(toUtc(day)));
}

export function weekdayShort(day: Day): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(new Date(toUtc(day)));
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = (Date.parse(iso) - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: abs > 86400 * 300 ? 'numeric' : undefined }).format(new Date(iso));
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
