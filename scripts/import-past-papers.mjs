// ============================================================
// Add papers to Chapter's resources directory (admin only)
// ------------------------------------------------------------
// Two modes:
//
// 1. Links (the default and the safe choice). A manifest lists publisher
//    pages; nothing is downloaded or re-hosted:
//      node scripts/import-past-papers.mjs --links ./links.json [--dry-run]
//    links.json: [{ "subject_key": "igcse.physics", "title": "...", "provider": "Cambridge International",
//                   "resource_type": "syllabus", "external_url": "https://...", "official": true }]
//
// 2. Hosting files Chapter has the right to redistribute. Refuses to run
//    without an explicit licence and a declaration of redistribution rights:
//      node scripts/import-past-papers.mjs ./papers \
//        --source-type owned|licensed|open_license \
//        --licence "CC BY 4.0" [--source-url https://...] \
//        --i-have-redistribution-rights [--dry-run]
//
// Every row is created with status 'pending': an administrator approves it
// in the admin screen before students see it. Needs the service-role key,
// which must never be shipped to the browser:
//   SUPABASE_URL=https://xyz.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-past-papers.mjs ...
//
// Do NOT use this to upload Cambridge past papers, mark schemes or examiner
// reports, PMT resources or any other publisher's material unless you hold a
// written licence to redistribute them. A file being free to download is
// not permission to re-host it. Link to the publisher's page instead.
// ============================================================
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const CODES = {
  '0610': 'igcse.biology', '0620': 'igcse.chemistry', '0625': 'igcse.physics', '0580': 'igcse.mathematics',
  '0478': 'igcse.computer-science', '0455': 'igcse.economics', '0500': 'igcse.english', '0450': 'igcse.business',
};
const SESSIONS = { m: 'feb_mar', s: 'may_jun', w: 'oct_nov', y: 'specimen' };
const TYPES = { qp: 'question_paper', ms: 'mark_scheme', in: 'insert', sp: 'specimen', sm: 'mark_scheme' };
const TYPE_TITLE = { question_paper: 'Question paper', mark_scheme: 'Mark scheme', insert: 'Insert', specimen: 'Specimen paper' };
const HOSTABLE = ['owned', 'licensed', 'open_license'];
const RESOURCE_TYPES = ['question_paper', 'mark_scheme', 'insert', 'specimen', 'syllabus', 'practice_test', 'examiner_report', 'notes', 'video', 'other'];

/** Metadata from a Cambridge-style file name (the name only; nothing is fetched). */
export function parseCambridge(file) {
  const m = /^(\d{4})_([mswy])(\d{2})_(qp|ms|in|sp|sm)_(\d)(\d)?\.pdf$/i.exec(basename(file));
  if (!m) return null;
  const [, code, sess, yy, type, paper, variant] = m;
  const subject_key = CODES[code];
  if (!subject_key) return null;
  const resource_type = TYPES[type.toLowerCase()];
  const paper_number = Number(paper);
  return {
    subject_key, year: 2000 + Number(yy), session: SESSIONS[sess.toLowerCase()], resource_type, paper_number,
    variant: variant ? Number(variant) : null, program: 'igcse',
    title: `Paper ${paper_number}${variant ? ` (variant ${variant})` : ''} · ${TYPE_TITLE[resource_type]}`,
  };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function client(dry) {
  if (dry) return null;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role, server-side only).');
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function importLinks(file, dry) {
  const list = JSON.parse(readFileSync(file, 'utf8'));
  const db = client(dry);
  let ok = 0;
  for (const r of list) {
    if (!/^https:\/\//.test(r.external_url ?? '') || !r.title || !r.provider || !RESOURCE_TYPES.includes(r.resource_type)) {
      console.warn('skip (needs https external_url, title, provider and a valid resource_type):', JSON.stringify(r));
      continue;
    }
    const row = {
      subject_key: r.subject_key ?? null, program: r.subject_key?.startsWith('sat.') ? 'sat' : r.subject_key ? 'igcse' : null,
      title: r.title, provider: r.provider, resource_type: r.resource_type, year: r.year ?? null, session: r.session ?? null,
      paper_number: r.paper_number ?? null, access: 'external', source_type: r.official ? 'official_reference' : 'external_link',
      redistribution_allowed: false, external_url: r.external_url, status: 'pending',
    };
    if (dry) { console.log('would add link', JSON.stringify(row)); ok++; continue; }
    const { error } = await db.from('resources').insert(row);
    if (error) console.error(`insert failed for ${r.external_url}: ${error.message}`);
    else ok++;
  }
  console.log(`done: ${ok} links added (pending admin approval)`);
}

async function importFiles(dir, dry) {
  const sourceType = arg('--source-type');
  const licence = arg('--licence');
  const sourceUrl = arg('--source-url') ?? null;
  if (!HOSTABLE.includes(sourceType ?? '') || !licence || !process.argv.includes('--i-have-redistribution-rights')) {
    console.error([
      'Refusing to host files without explicit rights.',
      'Pass --source-type owned|licensed|open_license, --licence "<licence>" and --i-have-redistribution-rights.',
      'If you do not hold redistribution rights, add a link to the publisher\'s page with --links instead.',
    ].join('\n'));
    process.exit(2);
  }
  if (sourceType !== 'owned' && !/^https:\/\//.test(sourceUrl ?? '')) {
    console.error('Licensed or openly licensed material needs --source-url https://... pointing at the licence or origin.');
    process.exit(2);
  }
  const manifestPath = join(dir, 'papers.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
  const byFile = new Map(manifest.map((m) => [m.file, m]));
  const db = client(dry);
  let ok = 0;
  let skipped = 0;
  for (const file of readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf'))) {
    const meta = byFile.get(file) ?? parseCambridge(file);
    if (!meta) { console.warn(`skip ${file}: not described in papers.json`); skipped++; continue; }
    const bytes = readFileSync(join(dir, file));
    if (bytes.subarray(0, 5).toString() !== '%PDF-') { console.warn(`skip ${file}: not a PDF`); skipped++; continue; }
    const storage_path = `${meta.subject_key}/${meta.year ?? 'undated'}/${file}`;
    const rest = { ...meta };
    delete rest.file;
    delete rest.kind;
    const row = {
      ...rest, resource_type: rest.resource_type ?? 'question_paper', provider: meta.provider ?? 'Chapter',
      access: 'download', source_type: sourceType, license: licence, redistribution_allowed: true,
      storage_path, status: 'pending',
    };
    if (sourceUrl) row.external_url = sourceUrl;
    if (dry) { console.log('would host', storage_path, JSON.stringify(row)); ok++; continue; }
    const up = await db.storage.from('past-papers').upload(storage_path, bytes, { contentType: 'application/pdf', upsert: false });
    if (up.error) { console.error(`upload failed ${file}: ${up.error.message}`); skipped++; continue; }
    const { error } = await db.from('resources').insert(row);
    if (error) { console.error(`insert failed ${file}: ${error.message}`); skipped++; continue; }
    console.log('added (pending approval)', storage_path);
    ok++;
  }
  console.log(`done: ${ok} added, ${skipped} skipped`);
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const links = arg('--links');
  if (links) return importLinks(links, dry);
  const dir = process.argv[2];
  if (!dir || dir.startsWith('--') || !existsSync(dir)) {
    console.error('Usage: node scripts/import-past-papers.mjs --links links.json | <folder> --source-type ... --licence ... --i-have-redistribution-rights');
    process.exit(1);
  }
  return importFiles(dir, dry);
}

if (import.meta.url.endsWith(basename(process.argv[1] ?? ''))) {
  await main();
}
