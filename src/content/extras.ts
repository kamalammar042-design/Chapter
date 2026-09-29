// Where the reading passages and written (short-answer) questions belong in
// the catalogue. Kept separate from the lazily loaded bank so pages can show
// the right options without downloading it.

export const READING_TOPICS: Record<string, string> = {
  'igcse.english': 'reading',
  'sat.reading-writing': 'information-ideas',
};

/** Legacy written-question subject ids → catalogue subject + topic. */
export const WRITTEN_MAP: Record<number, { subject: string; topics: Record<string, string> }> = {
  1: { subject: 'igcse.physics', topics: { Mechanics: 'motion-forces-energy' } },
  2: { subject: 'igcse.chemistry', topics: { 'Physical Chemistry': 'physical' } },
  4: { subject: 'igcse.biology', topics: { 'Cell Biology': 'cells', Genetics: 'genetics' } },
  5: { subject: 'igcse.english', topics: { Grammar: 'language', Literature: 'techniques', 'Essay Writing': 'writing' } },
};

export const WRITTEN_SUBJECTS = new Set(Object.values(WRITTEN_MAP).map((m) => m.subject));
