// Runs the link checker on demand.
//
//   SUPABASE_URL=https://<ref>.supabase.co CRON_SECRET=... node scripts/check-links.mjs
//
// Or, without a deployed project, check the seed list directly:
//   node scripts/check-links.mjs --local
import { readFileSync } from 'node:fs';

if (process.argv.includes('--local')) {
  const src = readFileSync(new URL('../src/content/official-resources.ts', import.meta.url), 'utf8');
  const urls = [...new Set([...src.matchAll(/https:\/\/[^'"`\s]+/g)].map((m) => m[0]))];
  const expanded = urls.filter((u) => !u.includes('${'));
  const slugs = [...src.matchAll(/cambridge\('([a-z0-9-]+)'\)/g)].map((m) => `https://www.cambridgeinternational.org/programmes-and-qualifications/${m[1]}/`);
  let failed = 0;
  for (const url of [...expanded, ...slugs]) {
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': 'ChapterLinkChecker/1.0' } });
      console.log(`${res.status}  ${url}`);
      if (res.status === 404 || res.status === 410) failed++;
    } catch (e) {
      console.log(`ERR  ${url}  ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  process.exit(failed ? 1 : 0);
}

const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
const secret = process.env.CRON_SECRET;
if (!url || !secret) {
  console.error('Set SUPABASE_URL and CRON_SECRET, or pass --local.');
  process.exit(2);
}
const res = await fetch(`${url}/functions/v1/link-checker`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
