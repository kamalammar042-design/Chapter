import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';

/** Sets the document title for the current page. */
// eslint-disable-next-line react-refresh/only-export-components
export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Chapter` : 'Chapter — Your AI study companion';
  }, [title]);
}

export function Page({ children, width, className }: { children: ReactNode; width?: 'narrow' | 'reading'; className?: string }) {
  return <div className={['page', width && `page--${width}`, 'fade-up', className].filter(Boolean).join(' ')}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions, back, eyebrow }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string }; eyebrow?: ReactNode;
}) {
  return (
    <>
      {back && (
        <Link to={back.to} className="back-link">
          <ArrowLeft aria-hidden="true" /> {back.label}
        </Link>
      )}
      <div className="page-header">
        <div className="grow" style={{ minWidth: 0 }}>
          {eyebrow && <div className="text-sm text-3 fw-500 mb-2">{eyebrow}</div>}
          <h1 className="page-header__title">{title}</h1>
          {subtitle && <p className="page-header__sub">{subtitle}</p>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
    </>
  );
}

export function Section({ title, action, children, id }: { title: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="section" aria-labelledby={id}>
      <div className="section__head">
        <h2 className="section__title" id={id}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
