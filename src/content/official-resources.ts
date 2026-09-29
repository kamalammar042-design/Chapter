// Official-source directory seed. These are links to publishers' own pages.
// Chapter does not host or redistribute their documents: Cambridge's
// guidance restricts electronic publication of its past papers without
// permission, so specimen papers and past papers are reached through the
// official pages. Every URL was checked on 2026-09-28 and is re-checked by
// the link checker (supabase/functions/link-checker).

export interface OfficialResource {
  subjectKey: string | null;
  program: 'igcse' | 'sat';
  title: string;
  provider: string;
  resourceType: 'syllabus' | 'practice_test' | 'specimen' | 'other';
  url: string;
}

const cambridge = (slug: string) => `https://www.cambridgeinternational.org/programmes-and-qualifications/${slug}/`;
const CAMBRIDGE = 'Cambridge International';

export const OFFICIAL_RESOURCES: OfficialResource[] = [
  { subjectKey: 'igcse.biology', program: 'igcse', title: 'Cambridge IGCSE Biology (0610): syllabus and specimen papers', provider: CAMBRIDGE, resourceType: 'syllabus', url: cambridge('cambridge-igcse-biology-0610') },
  { subjectKey: 'igcse.chemistry', program: 'igcse', title: 'Cambridge IGCSE Chemistry (0620): syllabus and specimen papers', provider: CAMBRIDGE, resourceType: 'syllabus', url: cambridge('cambridge-igcse-chemistry-0620') },
  { subjectKey: 'igcse.physics', program: 'igcse', title: 'Cambridge IGCSE Physics (0625): syllabus and specimen papers', provider: CAMBRIDGE, resourceType: 'syllabus', url: cambridge('cambridge-igcse-physics-0625') },
  { subjectKey: 'igcse.mathematics', program: 'igcse', title: 'Cambridge IGCSE Mathematics (0580): syllabus and specimen papers', provider: CAMBRIDGE, resourceType: 'syllabus', url: cambridge('cambridge-igcse-mathematics-0580') },
  { subjectKey: 'igcse.computer-science', program: 'igcse', title: 'Cambridge IGCSE Computer Science (0478): syllabus and specimen papers', provider: CAMBRIDGE, resourceType: 'syllabus', url: cambridge('cambridge-igcse-computer-science-0478') },
  { subjectKey: 'igcse.economics', program: 'igcse', title: 'Cambridge IGCSE Economics (0455): syllabus and specimen papers', provider: CAMBRIDGE, resourceType: 'syllabus', url: cambridge('cambridge-igcse-economics-0455') },
  { subjectKey: 'igcse.english', program: 'igcse', title: 'Cambridge IGCSE First Language English (0500): syllabus and specimen papers', provider: CAMBRIDGE, resourceType: 'syllabus', url: cambridge('cambridge-igcse-english-first-language-0500') },
  { subjectKey: 'igcse.business', program: 'igcse', title: 'Cambridge IGCSE Business Studies (0450): syllabus and specimen papers', provider: CAMBRIDGE, resourceType: 'syllabus', url: cambridge('cambridge-igcse-business-studies-0450') },
  { subjectKey: 'sat.math', program: 'sat', title: 'Official SAT practice tests (full-length, digital)', provider: 'College Board', resourceType: 'practice_test', url: 'https://satsuite.collegeboard.org/practice/practice-tests' },
  { subjectKey: 'sat.reading-writing', program: 'sat', title: 'Official SAT practice tests (full-length, digital)', provider: 'College Board', resourceType: 'practice_test', url: 'https://satsuite.collegeboard.org/practice/practice-tests' },
  { subjectKey: 'sat.math', program: 'sat', title: 'Bluebook: the official digital SAT testing app', provider: 'College Board', resourceType: 'other', url: 'https://bluebook.collegeboard.org/' },
  { subjectKey: 'sat.math', program: 'sat', title: 'What is on the SAT Math section', provider: 'College Board', resourceType: 'syllabus', url: 'https://satsuite.collegeboard.org/sat/whats-on-the-test/math' },
  { subjectKey: 'sat.reading-writing', program: 'sat', title: 'What is on the SAT Reading and Writing section', provider: 'College Board', resourceType: 'syllabus', url: 'https://satsuite.collegeboard.org/sat/whats-on-the-test/reading-writing' },
  { subjectKey: 'sat.math', program: 'sat', title: 'Official Digital SAT Prep (free, with College Board)', provider: 'Khan Academy', resourceType: 'other', url: 'https://www.khanacademy.org/test-prep/digital-sat' },
  { subjectKey: 'sat.reading-writing', program: 'sat', title: 'Official Digital SAT Prep (free, with College Board)', provider: 'Khan Academy', resourceType: 'other', url: 'https://www.khanacademy.org/test-prep/digital-sat' },
];
