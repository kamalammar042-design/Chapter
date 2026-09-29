-- ============================================================
-- CHAPTER — Migration 010: catalogue seed
-- ------------------------------------------------------------
-- GENERATED from src/content/catalog.ts by scripts/generate-catalog-sql.mjs.
-- Do not edit by hand. Safe to re-run: rows are upserted, never deleted
-- (attempts reference topics, so retired topics stay for history).
-- ============================================================

insert into public.catalog_subjects (key, program, name, code, sort) values
  ('igcse.biology', 'igcse', 'Biology', '0610', 1),
  ('igcse.chemistry', 'igcse', 'Chemistry', '0620', 2),
  ('igcse.physics', 'igcse', 'Physics', '0625', 3),
  ('igcse.mathematics', 'igcse', 'Mathematics', '0580', 4),
  ('igcse.computer-science', 'igcse', 'Computer Science', '0478', 5),
  ('igcse.economics', 'igcse', 'Economics', '0455', 6),
  ('igcse.english', 'igcse', 'English', '0500', 7),
  ('igcse.business', 'igcse', 'Business', '0450', 8),
  ('sat.math', 'sat', 'Math', null, 9),
  ('sat.reading-writing', 'sat', 'Reading & Writing', null, 10)
on conflict (key) do update
  set program = excluded.program, name = excluded.name, code = excluded.code, sort = excluded.sort;

insert into public.catalog_topics (subject_key, key, name, sort) values
  ('igcse.biology', 'cells', 'Cells & organisation', 1),
  ('igcse.biology', 'human-biology', 'Human biology', 2),
  ('igcse.biology', 'genetics', 'Inheritance & genetics', 3),
  ('igcse.biology', 'ecology', 'Ecology & environment', 4),
  ('igcse.chemistry', 'physical', 'Physical chemistry', 1),
  ('igcse.chemistry', 'inorganic', 'Inorganic chemistry', 2),
  ('igcse.chemistry', 'organic', 'Organic chemistry', 3),
  ('igcse.chemistry', 'analysis', 'Experimental techniques & analysis', 4),
  ('igcse.physics', 'motion-forces-energy', 'Motion, forces & energy', 1),
  ('igcse.physics', 'thermal', 'Thermal physics', 2),
  ('igcse.physics', 'waves', 'Waves', 3),
  ('igcse.physics', 'electricity', 'Electricity', 4),
  ('igcse.physics', 'magnetism', 'Magnetism & electromagnetism', 5),
  ('igcse.physics', 'nuclear-space', 'Nuclear & space physics', 6),
  ('igcse.mathematics', 'number', 'Number', 1),
  ('igcse.mathematics', 'algebra', 'Algebra & graphs', 2),
  ('igcse.mathematics', 'geometry', 'Geometry, mensuration & trigonometry', 3),
  ('igcse.mathematics', 'statistics', 'Statistics & probability', 4),
  ('igcse.computer-science', 'data-representation', 'Data representation & hardware', 1),
  ('igcse.computer-science', 'networks', 'Networks & the internet', 2),
  ('igcse.computer-science', 'algorithms', 'Algorithm design', 3),
  ('igcse.computer-science', 'programming', 'Programming', 4),
  ('igcse.economics', 'micro', 'Microeconomic decision makers', 1),
  ('igcse.economics', 'markets', 'Allocation of resources', 2),
  ('igcse.economics', 'macro', 'Government & the macroeconomy', 3),
  ('igcse.economics', 'trade', 'International trade & money', 4),
  ('igcse.english', 'reading', 'Reading & comprehension', 1),
  ('igcse.english', 'writing', 'Writing', 2),
  ('igcse.english', 'language', 'Language & grammar', 3),
  ('igcse.english', 'techniques', 'Language & literary techniques', 4),
  ('igcse.business', 'enterprise', 'Business activity & enterprise', 1),
  ('igcse.business', 'marketing', 'Marketing', 2),
  ('igcse.business', 'operations', 'Operations management', 3),
  ('igcse.business', 'finance', 'Financial information & decisions', 4),
  ('sat.math', 'algebra', 'Algebra', 1),
  ('sat.math', 'advanced-math', 'Advanced math', 2),
  ('sat.math', 'problem-solving', 'Problem-solving & data analysis', 3),
  ('sat.math', 'geometry-trig', 'Geometry & trigonometry', 4),
  ('sat.reading-writing', 'information-ideas', 'Information & ideas', 1),
  ('sat.reading-writing', 'craft-structure', 'Craft & structure', 2),
  ('sat.reading-writing', 'expression-ideas', 'Expression of ideas', 3),
  ('sat.reading-writing', 'standard-english', 'Standard English conventions', 4)
on conflict (subject_key, key) do update
  set name = excluded.name, sort = excluded.sort;
