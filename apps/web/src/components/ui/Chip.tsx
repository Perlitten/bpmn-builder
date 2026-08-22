import type { HTMLAttributes } from 'react';

export function Chip({ className = '', ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`ui-chip ${className}`} {...props} />;
}
