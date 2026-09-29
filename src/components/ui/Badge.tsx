import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({ tone = 'neutral', icon, children, outline }: { tone?: Tone; icon?: ReactNode; children: ReactNode; outline?: boolean }) {
  return (
    <span className={`badge${tone !== 'neutral' ? ` badge--${tone}` : ''}${outline ? ' badge--outline' : ''}`}>
      {icon}
      {children}
    </span>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, block }: {
  value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; label: string; block?: boolean;
}) {
  return (
    <div className={`segmented${block ? ' segmented--block' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
