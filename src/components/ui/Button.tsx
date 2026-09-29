import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
}

function classes(variant: Variant, size: Size, block?: boolean, iconOnly?: boolean, extra?: string) {
  return ['btn', `btn--${variant}`, size !== 'md' && `btn--${size}`, block && 'btn--block', iconOnly && 'btn--icon', extra]
    .filter(Boolean).join(' ');
}

export interface ButtonProps extends CommonProps, ButtonHTMLAttributes<HTMLButtonElement> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, icon, iconRight, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes(variant, size, block, !children, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
});

export interface ButtonLinkProps extends CommonProps, LinkProps {}

export function ButtonLink({ variant = 'primary', size = 'md', block, icon, iconRight, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={classes(variant, size, block, !children, className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}

export function IconButton({ label, icon, variant = 'ghost', size = 'md', ...rest }: Omit<ButtonProps, 'children'> & { label: string; icon: ReactNode }) {
  return <Button variant={variant} size={size} icon={icon} aria-label={label} title={label} {...rest} />;
}
