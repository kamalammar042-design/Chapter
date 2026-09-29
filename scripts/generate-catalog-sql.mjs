#!/usr/bin/env node
// Generates supabase/migrations/010_catalog_seed.sql from src/content/catalog.ts.
//   node scripts/generate-catalog-sql.mjs          write the file
//   node scripts/generate-catalog-sql.mjs --check  exit 1 if the file is stale
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'supabase', 'migrations', '010_catalog_seed.sql');

export async function buildCatalogSql() {
  const { SUBJECTS } = await import(pathToFileURL(join(root, 'src', 'content', 'catalog.ts')).href);
  const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

  const subjects = SUBJECTS.map(
    (s, i) => `  (${q(s.key)}, ${q(s.program)}, ${q(s.name)}, ${q(s.code)}, ${i + 1})`,
  ).join(',\n');
  const topics = SUBJECTS.flatMap((s) =>
    s.topics.map((t, i) => `  (${q(s.key)}, ${q(t.key)}, ${q(t.name)}, ${i + 1})`),
  ).join(',\n');

  return `-- ============================================================
-- CHAPTER — Migration 010: catalogue seed
-- ------------------------------------------------------------
-- GENERATED from src/content/catalog.ts by scripts/generate-catalog-sql.mjs.
-- Do not edit by hand. Safe to re-run: rows are upserted, never deleted
-- (attempts reference topics, so retired topics stay for history).
-- ============================================================

insert into public.catalog_subjects (key, program, name, code, sort) values
${subjects}
on conflict (key) do update
  set program = excluded.program, name = excluded.name, code = excluded.code, sort = excluded.sort;

insert into public.catalog_topics (subject_key, key, name, sort) values
${topics}
on conflict (subject_key, key) do update
  set name = excluded.name, sort = excluded.sort;
`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sql = await buildCatalogSql();
  if (process.argv.includes('--check')) {
    const current = readFileSync(out, 'utf8');
    if (current.replace(/\r\n/g, '\n') !== sql) {
      console.error('010_catalog_seed.sql is out of date. Run: node scripts/generate-catalog-sql.mjs');
      process.exit(1);
    }
    console.log('catalogue seed is up to date');
  } else {
    writeFileSync(out, sql);
    console.log(`wrote ${out}`);
  }
}
