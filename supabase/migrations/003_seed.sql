-- ============================================================
-- CHAPTER — Reference Data Seed
-- Migration 003: seed subjects + topics
-- ------------------------------------------------------------
-- Run AFTER 001 and 002. Populates the fixed curriculum content so
-- progress rows can reference real subject/topic ids. Matches the
-- SUBJECTS_META in the app exactly. Safe to re-run (upserts).
-- ============================================================

insert into public.subjects (id, name, emoji, color) values
  (1, 'Physics',   '⚛️', '#ff6b6b'),
  (2, 'Chemistry', '🧪', '#a855f7'),
  (3, 'Math',      '📐', '#f472b6'),
  (4, 'Biology',   '🧬', '#22c55e'),
  (5, 'English',   '📝', '#60a5fa')
on conflict (id) do update set name = excluded.name, emoji = excluded.emoji, color = excluded.color;

insert into public.topics (id, subject_id, name) values
  -- Physics (1)
  (101, 1, 'Waves'), (102, 1, 'Thermodynamics'), (103, 1, 'Electricity'),
  (104, 1, 'Mechanics'), (105, 1, 'Magnetism'), (106, 1, 'Modern Physics'),
  -- Chemistry (2)
  (201, 2, 'Organic'), (202, 2, 'Physical Chemistry'), (203, 2, 'Inorganic'), (204, 2, 'Analytical'),
  -- Math (3)
  (301, 3, 'Algebra'), (302, 3, 'Calculus'), (303, 3, 'Geometry'), (304, 3, 'Statistics'),
  -- Biology (4)
  (401, 4, 'Genetics'), (402, 4, 'Cell Biology'), (403, 4, 'Ecology'), (404, 4, 'Human Biology'),
  -- English (5)
  (501, 5, 'Essay Writing'), (502, 5, 'Grammar'), (503, 5, 'Literature'), (504, 5, 'Reading Comprehension')
on conflict (id) do update set subject_id = excluded.subject_id, name = excluded.name;
