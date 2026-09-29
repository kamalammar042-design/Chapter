// ============================================================
// Chapter content catalogue
// ------------------------------------------------------------
// The single definition of programs, subjects and topics. The database
// seed (supabase/migrations/010_catalog_seed.sql) is generated from this
// file by `node scripts/generate-catalog-sql.mjs`, and a test fails if the
// two ever drift apart.
//
// `bank` links a topic to question-bank sections ("Subject>Topic" keys in
// src/content/bank/*). A topic may draw on several sections.
// ============================================================

export type ProgramKey = 'igcse' | 'sat';
export type IgcseTier = 'core' | 'extended';

export interface Topic {
  key: string;
  name: string;
  bank: string[];
}

export interface Subject {
  key: string;
  program: ProgramKey;
  name: string;
  /** syllabus reference shown to students, e.g. "0625" */
  code?: string;
  color: string;
  topics: Topic[];
}

export interface Program {
  key: ProgramKey;
  name: string;
  description: string;
  /** what a target looks like for this program, used in onboarding */
  targetKind: 'grade' | 'score';
  targets: string[];
}

export const PROGRAMS: Record<ProgramKey, Program> = {
  igcse: {
    key: 'igcse',
    name: 'IGCSE',
    description: 'International GCSE, Core and Extended',
    targetKind: 'grade',
    targets: ['A*', 'A', 'B', 'C', 'D', 'E'],
  },
  sat: {
    key: 'sat',
    name: 'SAT',
    description: 'Digital SAT, Math and Reading & Writing',
    targetKind: 'score',
    targets: ['800', '750', '700', '650', '600', '550', '500'],
  },
};

export const SUBJECTS: Subject[] = [
  // ---- IGCSE ------------------------------------------------
  {
    key: 'igcse.biology', program: 'igcse', name: 'Biology', code: '0610', color: '#34D399',
    topics: [
      { key: 'cells', name: 'Cells & organisation', bank: ['Biology>Cell Biology'] },
      { key: 'human-biology', name: 'Human biology', bank: ['Biology>Human Biology'] },
      { key: 'genetics', name: 'Inheritance & genetics', bank: ['Biology>Genetics'] },
      { key: 'ecology', name: 'Ecology & environment', bank: ['Biology>Ecology'] },
    ],
  },
  {
    key: 'igcse.chemistry', program: 'igcse', name: 'Chemistry', code: '0620', color: '#FBBF24',
    topics: [
      { key: 'physical', name: 'Physical chemistry', bank: ['Chemistry>Physical Chemistry'] },
      { key: 'inorganic', name: 'Inorganic chemistry', bank: ['Chemistry>Inorganic'] },
      { key: 'organic', name: 'Organic chemistry', bank: ['Chemistry>Organic'] },
      { key: 'analysis', name: 'Experimental techniques & analysis', bank: ['Chemistry>Analytical'] },
    ],
  },
  {
    key: 'igcse.physics', program: 'igcse', name: 'Physics', code: '0625', color: '#60A5FA',
    topics: [
      { key: 'motion-forces-energy', name: 'Motion, forces & energy', bank: ['Physics>Mechanics'] },
      { key: 'thermal', name: 'Thermal physics', bank: ['Physics>Thermodynamics'] },
      { key: 'waves', name: 'Waves', bank: ['Physics>Waves'] },
      { key: 'electricity', name: 'Electricity', bank: ['Physics>Electricity'] },
      { key: 'magnetism', name: 'Magnetism & electromagnetism', bank: ['Physics>Magnetism'] },
      { key: 'nuclear-space', name: 'Nuclear & space physics', bank: ['Physics>Modern Physics'] },
    ],
  },
  {
    key: 'igcse.mathematics', program: 'igcse', name: 'Mathematics', code: '0580', color: '#F472B6',
    topics: [
      { key: 'number', name: 'Number', bank: ['Math>Number'] },
      { key: 'algebra', name: 'Algebra & graphs', bank: ['Math>Algebra'] },
      { key: 'geometry', name: 'Geometry, mensuration & trigonometry', bank: ['Math>Geometry'] },
      { key: 'statistics', name: 'Statistics & probability', bank: ['Math>Statistics'] },
    ],
  },
  {
    key: 'igcse.computer-science', program: 'igcse', name: 'Computer Science', code: '0478', color: '#22D3EE',
    topics: [
      { key: 'data-representation', name: 'Data representation & hardware', bank: ['Computer Science>Data & Systems'] },
      { key: 'networks', name: 'Networks & the internet', bank: ['Computer Science>Networks'] },
      { key: 'algorithms', name: 'Algorithm design', bank: ['Computer Science>Algorithms'] },
      { key: 'programming', name: 'Programming', bank: ['Computer Science>Programming'] },
    ],
  },
  {
    key: 'igcse.economics', program: 'igcse', name: 'Economics', code: '0455', color: '#A3E635',
    topics: [
      { key: 'micro', name: 'Microeconomic decision makers', bank: ['Economics>Microeconomics'] },
      { key: 'markets', name: 'Allocation of resources', bank: ['Economics>Markets'] },
      { key: 'macro', name: 'Government & the macroeconomy', bank: ['Economics>Macroeconomics'] },
      { key: 'trade', name: 'International trade & money', bank: ['Economics>Money & Trade'] },
    ],
  },
  {
    key: 'igcse.english', program: 'igcse', name: 'English', code: '0500', color: '#FB7185',
    topics: [
      { key: 'reading', name: 'Reading & comprehension', bank: ['English>Reading Comprehension'] },
      { key: 'writing', name: 'Writing', bank: ['English>Essay Writing'] },
      { key: 'language', name: 'Language & grammar', bank: ['English>Grammar'] },
      { key: 'techniques', name: 'Language & literary techniques', bank: ['English>Literature'] },
    ],
  },
  {
    key: 'igcse.business', program: 'igcse', name: 'Business', code: '0450', color: '#FB923C',
    topics: [
      { key: 'enterprise', name: 'Business activity & enterprise', bank: ['Business>Enterprise'] },
      { key: 'marketing', name: 'Marketing', bank: ['Business>Marketing'] },
      { key: 'operations', name: 'Operations management', bank: ['Business>Operations'] },
      { key: 'finance', name: 'Financial information & decisions', bank: ['Business>Finance'] },
    ],
  },
  // ---- SAT --------------------------------------------------
  {
    key: 'sat.math', program: 'sat', name: 'Math', color: '#818CF8',
    topics: [
      { key: 'algebra', name: 'Algebra', bank: ['SAT Math>Algebra', 'Math>Algebra'] },
      { key: 'advanced-math', name: 'Advanced math', bank: ['SAT Math>Advanced Math'] },
      { key: 'problem-solving', name: 'Problem-solving & data analysis', bank: ['SAT Math>Problem-Solving', 'Math>Statistics'] },
      { key: 'geometry-trig', name: 'Geometry & trigonometry', bank: ['SAT Math>Geometry', 'Math>Geometry'] },
    ],
  },
  {
    key: 'sat.reading-writing', program: 'sat', name: 'Reading & Writing', color: '#2DD4BF',
    topics: [
      { key: 'information-ideas', name: 'Information & ideas', bank: ['SAT RW>Information & Ideas', 'English>Reading Comprehension'] },
      { key: 'craft-structure', name: 'Craft & structure', bank: ['SAT RW>Craft & Structure'] },
      { key: 'expression-ideas', name: 'Expression of ideas', bank: ['SAT RW>Expression of Ideas'] },
      { key: 'standard-english', name: 'Standard English conventions', bank: ['SAT RW>Conventions', 'English>Grammar'] },
    ],
  },
];

const BY_KEY = new Map(SUBJECTS.map((s) => [s.key, s]));

export function getSubject(key: string | null | undefined): Subject | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

export function getTopic(subjectKey: string, topicKey: string): Topic | undefined {
  return getSubject(subjectKey)?.topics.find((t) => t.key === topicKey);
}

export function subjectsFor(program: ProgramKey | null | undefined): Subject[] {
  return program ? SUBJECTS.filter((s) => s.program === program) : SUBJECTS;
}

export function subjectLabel(s: Subject): string {
  return s.program === 'sat' ? `SAT ${s.name}` : s.name;
}

export function topicLabel(subjectKey: string, topicKey: string): string {
  return getTopic(subjectKey, topicKey)?.name ?? topicKey;
}
