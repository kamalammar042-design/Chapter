import type { CSSProperties, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from './Button';
import { toAppError } from '@/lib/errors';

export function EmptyState({ icon, title, body, actions, compact }: {
  icon?: ReactNode; title: string; body?: ReactNode; actions?: ReactNode; compact?: boolean;
}) {
  return (
    <div className={`state${compact ? ' state--compact' : ''}`}>
      {icon && <div className="state__icon" aria-hidden="true">{icon}</div>}
      <p className="state__title">{title}</p>
      {body && <div className="state__body">{body}</div>}
      {actions && <div className="state__actions">{actions}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title, compact }: { error: unknown; onRetry?: () => void; title?: string; compact?: boolean }) {
  const e = toAppError(error);
  const offline = e.code === 'offline';
  return (
    <div className={`state${compact ? ' state--compact' : ''}`} role="alert">
      <div className="state__icon state__icon--danger" aria-hidden="true">{offline ? <WifiOff /> : <AlertTriangle />}</div>
      <p className="state__title">{title ?? (offline ? 'You are offline' : 'Could not load this')}</p>
      <p className="state__body">{e.message}</p>
      {onRetry && (
        <div className="state__actions">
          <Button variant="secondary" size="sm" icon={<RefreshCw />} onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  );
}

export function Skeleton({ width, height = 14, radius, className, style }: {
  width?: number | string; height?: number | string; radius?: number; className?: string; style?: CSSProperties;
}) {
  return (
    <span
      className={`skeleton ${className ?? ''}`}
      aria-hidden="true"
      style={{ width: width ?? '100%', height, borderRadius: radius, ...style }}
    />
  );
}

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner spinner--lg text-3" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Alert({ tone = 'info', icon, children }: { tone?: 'info' | 'success' | 'warning' | 'danger'; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={`alert alert--${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      {icon}
      <div>{children}</div>
    </div>
  );
}
