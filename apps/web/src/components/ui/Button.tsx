import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'accent' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md';
  loading?: boolean;
  loadingLabel?: ReactNode;
};

export function minimumBusyDelay(startedAt: number, now: number, minimumMs = 400): number {
  return Math.max(0, minimumMs - (now - startedAt));
}

function useMinimumBusy(active: boolean, minimumMs = 400): boolean {
  const [visible, setVisible] = useState(active);
  const startedAt = useRef(active ? Date.now() : 0);
  useEffect(() => {
    if (active) {
      startedAt.current = Date.now();
      setVisible(true);
      return;
    }
    if (!visible) return;
    const delay = minimumBusyDelay(startedAt.current, Date.now(), minimumMs);
    const timer = window.setTimeout(() => setVisible(false), delay);
    return () => window.clearTimeout(timer);
  }, [active, minimumMs, visible]);
  return visible;
}

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
  const busy = useMinimumBusy(loading);
  const contractVariant = variant === 'outline' ? 'default' : variant;
  return (
    <button
      {...props}
      type={type}
      className={`ui-button ${className}`}
      data-variant={contractVariant}
      data-size={size}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      <span className="ui-button-content" aria-hidden={busy || undefined}>
        {children}
      </span>
      {busy ? <span className="ui-button-loading">{loadingLabel ?? children}</span> : null}
    </button>
  );
}
