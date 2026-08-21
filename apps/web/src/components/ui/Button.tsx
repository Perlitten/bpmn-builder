import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'accent' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md';
  loading?: boolean;
  loadingLabel?: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  disabled,
  loading = false,
  loadingLabel,
  children,
  ...props
}: ButtonProps) {
  const contractVariant = variant === 'outline' ? 'default' : variant;
  return (
    <button
      type={type}
      className={`ui-button ${className}`}
      data-variant={contractVariant}
      data-size={size}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <span className="ui-button-content" aria-hidden={loading || undefined}>
        {children}
      </span>
      {loading ? <span className="ui-button-loading">{loadingLabel ?? children}</span> : null}
    </button>
  );
}
