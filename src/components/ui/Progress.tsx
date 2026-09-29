import type { ReactNode } from 'react';

export function ProgressBar({ value, max = 1, tone, size, label }: {
  value: number; max?: number; tone?: 'primary' | 'success' | 'warning' | 'danger'; size?: 'sm' | 'lg'; label: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      className={`progress${size ? ` progress--${size}` : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className={`progress__fill${tone && tone !== 'primary' ? ` progress__fill--${tone}` : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ProgressRing({ value, size = 64, stroke = 6, label, children, color }: {
  value: number; size?: number; stroke?: number; label: string; children?: ReactNode; color?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={color ? { stroke: color } : undefined}
        />
      </svg>
      {children && <div className="ring__label">{children}</div>}
    </div>
  );
}
