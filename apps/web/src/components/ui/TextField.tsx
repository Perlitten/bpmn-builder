import type { InputHTMLAttributes } from 'react';

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  variant?: 'default' | 'plain' | 'title';
};

const variants = {
  default:
    'rounded border border-border bg-canvas px-3 py-2 focus-visible:ring-2 focus-visible:ring-accent',
  plain: 'rounded border-0 bg-transparent px-1.5 py-1 hover:bg-surface focus:bg-surface',
  title:
    'rounded border border-border bg-canvas px-2.5 py-1.5 text-base font-medium hover:border-accent/50 focus:border-accent focus-visible:ring-2 focus-visible:ring-accent',
};

export function TextField({ className = '', variant = 'default', ...props }: TextFieldProps) {
  return (
    <input
      className={`text-sm text-ink outline-none placeholder:text-muted ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
