import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ className, tight, flush, accent, ...rest }: HTMLAttributes<HTMLDivElement> & { tight?: boolean; flush?: boolean; accent?: boolean }) {
  return <div className={['card', tight && 'card--tight', flush && 'card--flush', accent && 'card--accent', className].filter(Boolean).join(' ')} {...rest} />;
}

export function CardHeader({ title, subtitle, action, as: As = 'h2' }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; as?: 'h2' | 'h3' }) {
  return (
    <div className="card__head">
      <div className="grow">
        <As className="card__title">{title}</As>
        {subtitle && <p className="card__sub">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
