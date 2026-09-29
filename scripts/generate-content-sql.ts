// ============================================================
// Generates the content seed migrations from the TypeScript content sources:
//   017_skills_seed.sql   skills + curated misconceptions
//   018_content_seed.sql  questions (with provenance), procedural families,
//                         official-resource directory
//
//   npx tsx scripts/generate-content-sql.ts          write the files
//   npx tsx scripts/generate-content-sql.ts --check  exit 1 if stale
//
// Provenance of every seeded question is explicit:
//   • legacy bank (core.js, extra.js): questions from the original Chapter
//     app, owned by Whitespace Studio
//   • original bank (igcse.js, sat.js): written for Chapter in 2026
//   • procedural families (templates.ts): Chapter's own generators
// Questions the classifier cannot place on a skill are seeded as
// 'pending_review' and are not shown to students until an admin reviews
// them. A-level-only material is excluded from IGCSE entirely.
// ============================================================
/* eslint-disable no-console -- command-line script */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS } from '../src/content/catalog';
import { SKILLS, classifyQuestion } from '../src/content/skills';
import { LEGACY_SECTIONS, ORIGINAL_SECTIONS, READING_PASSAGES, type RawQuestion } from '../src/content/bank';
import { TEMPLATES } from '../src/content/templates';
import { MISCONCEPTIONS } from '../src/content/misconceptions';
import { OFFICIAL_RESOURCES } from '../src/content/official-resources';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = join(ROOT, 'supabase', 'migrations');

const q = (s: string | null | undefined) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const j = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;
const arr = (xs: string[]) => (xs.length ? `array[${xs.map(q).join(', ')}]::text[]` : `'{}'::text[]`);
const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

const DIFF = { easy: 2, medium: 3, hard: 4 } as const;

const SOURCES = {
  legacy: {
    source_name: 'Chapter legacy question bank (Whitespace Studio)',
    license: 'Proprietary: Whitespace Studio',
    note: 'Imported from the original Chapter app.',
  },
  original: {
    source_name: 'Chapter original questions (2026)',
    license: 'Proprietary: Chapter',
    note: 'Written for Chapter; answers checked during authoring.',
  },
} as const;

function cognitive(stem: string): string {
  const s = stem.toLowerCase();
  if (/\d/.test(s) && /(calculate|what is the|how many|how much|find|solve|evaluate|convert|value)/.test(s)) return 'apply';
  if (/(which choice|best describes|most logically|suggest|explain|why)/.test(s)) return 'analyse';
  if (s.length < 70 && /^(what|which|who|when)\b/.test(s)) return 'recall';
  return 'understand';
}

function levelOk(program: string, levels: string[] | undefined): boolean {
  const l = levels ?? ['foundation', 'intermediate', 'advanced'];
  return program === 'igcse' ? l.includes('foundation') : l.includes('foundation') || l.includes('intermediate');
}

interface Row {
  subject: string; topic: string; skill: string | null; stem: string; options: string[]; correct: number;
  explanation: string; difficulty: number; tier: string; source: keyof typeof SOURCES; tags: string[];
}

export function buildRows(): { rows: Row[]; stats: Record<string, number> } {
  const rows: Row[] = [];
  const seen = new Set<string>();
  const stats: Record<string, number> = { excludedLevel: 0, duplicate: 0 };
  const add = (r: Row) => {
    const h = hash(`${r.subject}|${norm(r.stem)}|${r.options.map(norm).join('|')}`);
    if (seen.has(h)) { stats.duplicate++; return; }
    seen.add(h);
    rows.push(r);
  };

  for (const subject of SUBJECTS) {
    const topicKeys = subject.topics.map((t) => t.key);
    for (const topic of subject.topics) {
      for (const section of topic.bank) {
        for (const [source, bank] of [['legacy', LEGACY_SECTIONS], ['original', ORIGINAL_SECTIONS]] as const) {
          for (const raw of (bank[section] ?? []) as RawQuestion[]) {
            if (!levelOk(subject.program, raw.levels)) { stats.excludedLevel++; continue; }
            const text = `${raw.q} ${raw.options.join(' ')} ${raw.exp ?? ''}`;
            const c = classifyQuestion(subject.key, topic.key, text, topicKeys);
            const diff = raw.diff ?? 'medium';
            add({
              subject: subject.key,
              topic: c?.topicKey ?? topic.key,
              skill: c ? `${subject.key}/${c.topicKey}/${c.skillKey}` : null,
              stem: raw.q,
              options: raw.options.map(String),
              correct: raw.correct,
              explanation: raw.exp ?? '',
              difficulty: DIFF[diff],
              tier: subject.program === 'igcse' && diff === 'hard' ? 'extended' : 'all',
              source,
              tags: [source === 'legacy' ? 'legacy-bank' : 'chapter-original'],
            });
          }
        }
      }
    }
  }

  // Reading passages become ordinary questions with the passage in the stem.
  for (const p of READING_PASSAGES) {
    for (const [subjectKey, topicKey] of [['igcse.english', 'reading'], ['sat.reading-writing', 'information-ideas']] as const) {
      const subject = SUBJECTS.find((s) => s.key === subjectKey)!;
      for (const raw of p.questions) {
        const stem = `${p.title}\n\n${p.text}\n\n${raw.q}`;
        const c = classifyQuestion(subjectKey, topicKey, `${raw.q} ${raw.exp ?? ''}`, subject.topics.map((t) => t.key));
        const skill = c ? `${subjectKey}/${c.topicKey}/${c.skillKey}` : subjectKey === 'igcse.english' ? 'igcse.english/reading/inference' : 'sat.reading-writing/information-ideas/inferences';
        add({
          subject: subjectKey, topic: skill.split('/')[1], skill, stem, options: raw.options, correct: raw.correct,
          explanation: raw.exp ?? '', difficulty: p.level === 'foundation' ? 2 : 3, tier: 'all', source: 'legacy', tags: ['legacy-bank', 'reading-passage'],
        });
      }
    }
  }
  return { rows, stats };
}

function skillsSql(): string {
  const skillRows: string[] = [];
  for (const subject of SUBJECTS) {
    for (const topic of subject.topics) {
      (SKILLS[`${subject.key}/${topic.key}`] ?? []).forEach((s, i) => {
        skillRows.push(`  (${q(`${subject.key}/${topic.key}/${s.key}`)}, ${q(subject.key)}, ${q(topic.key)}, ${q(s.key)}, ${q(s.name)}, ${q(s.objective)}, ${i + 1})`);
      });
    }
  }
  const miscRows = Object.entries(MISCONCEPTIONS).flatMap(([skill, list]) =>
    list.map(([key, desc]) => `  (${q(skill)}, ${q(key)}, ${q(desc)}, 'curated')`));
  return `-- ============================================================
-- CHAPTER — Migration 017: skills + curated misconceptions
-- GENERATED by scripts/generate-content-sql.ts from src/content/skills.ts
-- and src/content/misconceptions.ts. Do not edit by hand.
-- ============================================================

insert into public.skills (id, subject_key, topic_key, key, name, objective, sort) values
${skillRows.join(',\n')}
on conflict (id) do update set name = excluded.name, objective = excluded.objective, sort = excluded.sort;

insert into public.misconceptions (skill_id, key, description, source) values
${miscRows.join(',\n')}
on conflict (skill_id, key) do update set description = excluded.description;
`;
}

function contentSql(): string {
  const { rows, stats } = buildRows();
  const qRows = rows.map((r) => {
    const src = SOURCES[r.source];
    const status = r.skill ? 'published' : 'pending_review';
    const note = r.skill ? src.note : `${src.note} No skill match: check topic and syllabus fit before publishing.`;
    const h = hash(`${r.subject}|${norm(r.stem)}|${r.options.map(norm).join('|')}`);
    return `  (${q(r.subject)}, ${q(r.topic)}, ${q(r.skill)}, 'mcq', null, ${q(r.stem)}, ${j(r.options.map((text) => ({ text })))}, ${r.correct}, ${q(r.explanation)}, ${r.difficulty}, ${q(cognitive(r.stem))}, ${q(r.tier)}, ${arr(r.tags)}, 'owned', ${q(src.source_name)}, ${q(src.license)}, 'owned', ${q(status)}, ${q(note)}, ${q(h)})`;
  });
  const tRows = TEMPLATES.map((t) => {
    const [subject, topic] = t.skillId.split('/');
    return `  (${q(subject)}, ${q(topic)}, ${q(t.skillId)}, 'procedural', ${q(t.key)}, ${q(`${t.name} (generated practice)`)}, '[]'::jsonb, null, '', ${t.difficulty}, ${q(t.cognitive)}, 'all', ${arr(['procedural'])}, 'owned', 'Chapter procedural generator', 'Proprietary: Chapter', 'owned', 'published', 'Deterministic generator; every instance re-checks its own answer.', ${q(hash(`template:${t.key}`))})`;
  });
  const rRows = OFFICIAL_RESOURCES.map((r) =>
    `  (${q(r.subjectKey)}, ${q(r.program)}, ${q(r.title)}, ${q(r.provider)}, ${q(r.resourceType)}, 'external', 'official_reference', false, ${q(r.url)}, 'active')`);
  const published = rows.filter((r) => r.skill).length;
  return `-- ============================================================
-- CHAPTER — Migration 018: content seed
-- GENERATED by scripts/generate-content-sql.ts. Do not edit by hand.
--   ${rows.length} questions (${published} published, ${rows.length - published} pending review)
--   ${TEMPLATES.length} procedural families
--   ${OFFICIAL_RESOURCES.length} official-source links
--   excluded as off-level for their program: ${stats.excludedLevel}; duplicates skipped: ${stats.duplicate}
-- Rows are inserted once and never overwritten, so admin edits survive re-runs.
-- ============================================================

insert into public.questions (subject_key, topic_key, skill_id, question_type, template_key, stem, options, correct_index,
  explanation, difficulty, cognitive_level, tier, tags, source_type, source_name, license, copyright_status, status,
  review_note, content_hash) values
${[...qRows, ...tRows].join(',\n')}
on conflict (content_hash) do nothing;

insert into public.resources (subject_key, program, title, provider, resource_type, access, source_type,
  redistribution_allowed, external_url, status) values
${rRows.join(',\n')}
on conflict (external_url, subject_key) where external_url is not null do nothing;
`;
}

function main(): void {
  const outputs: Array<[string, string]> = [
    [join(MIG, '017_skills_seed.sql'), skillsSql()],
    [join(MIG, '018_content_seed.sql'), contentSql()],
  ];

  if (process.argv.includes('--check')) {
    const stale = outputs.filter(([file, sql]) => {
      try { return readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== sql; } catch { return true; }
    });
    if (stale.length) {
      console.error(`Content seed is out of date: ${stale.map(([f]) => f).join(', ')}. Run: npx tsx scripts/generate-content-sql.ts`);
      process.exit(1);
    }
    console.log('content seed is up to date');
  } else {
    for (const [file, sql] of outputs) {
      writeFileSync(file, sql);
      console.log(`wrote ${file}`);
    }
    const { rows, stats } = buildRows();
    console.log(`questions: ${rows.length}, published: ${rows.filter((r) => r.skill).length}, pending: ${rows.filter((r) => !r.skill).length}, off-level excluded: ${stats.excludedLevel}, duplicates: ${stats.duplicate}`);
  }
}

// Run only when executed directly (tests import buildRows).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
