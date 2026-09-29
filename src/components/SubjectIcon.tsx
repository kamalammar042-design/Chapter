import { Atom, BookOpenText, Briefcase, Calculator, Code2, Dna, FlaskConical, LineChart, PenLine, Sigma, BookMarked } from 'lucide-react';
import type { CSSProperties } from 'react';
import { getSubject } from '@/content/catalog';

const ICONS: Record<string, typeof Atom> = {
  'igcse.biology': Dna,
  'igcse.chemistry': FlaskConical,
  'igcse.physics': Atom,
  'igcse.mathematics': Sigma,
  'igcse.computer-science': Code2,
  'igcse.economics': LineChart,
  'igcse.english': PenLine,
  'igcse.business': Briefcase,
  'sat.math': Calculator,
  'sat.reading-writing': BookOpenText,
};

export function SubjectIcon({ subjectKey, size }: { subjectKey: string | null | undefined; size?: 'sm' | 'lg' }) {
  const subject = getSubject(subjectKey);
  const Icon = (subjectKey && ICONS[subjectKey]) || BookMarked;
  return (
    <span
      className={`subject-icon${size ? ` subject-icon--${size}` : ''}`}
      style={{ '--c': subject?.color ?? 'var(--primary)' } as CSSProperties}
      aria-hidden="true"
    >
      <Icon />
    </span>
  );
}
