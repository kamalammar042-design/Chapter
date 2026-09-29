import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/Logo';

const POINTS = [
  'A tutor that knows your weak topics and teaches instead of just answering',
  'Adaptive practice for IGCSE and SAT, built around your mistakes',
  'Progress you can trust: every number comes from your own answers',
];

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth__panel" aria-hidden="true">
        <Logo size={30} />
        <div className="auth__pitch">
          <p className="auth__quote serif">Smarter studying.<br />Better results.</p>
          <ul className="auth__points">
            {POINTS.map((p) => (
              <li key={p}><CheckCircle2 size={18} /> <span>{p}</span></li>
            ))}
          </ul>
        </div>
        <p className="text-3 text-xs">IGCSE · SAT · AI tutoring · Personalised learning</p>
      </aside>
      <main className="auth__main">
        <div className="auth__form">
          <Link to="/" className="auth__logo" aria-label="Chapter home"><Logo size={28} /></Link>
          <h1 className="auth__title">{title}</h1>
          {subtitle && <p className="auth__subtitle">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="auth__footer">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
