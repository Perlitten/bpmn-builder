import type { ButtonHTMLAttributes, ReactNode } from 'react';

type PressedToggleProps = {
  pressed: boolean;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed' | 'children' | 'type'>;

export function PressedToggle({ pressed, children, className = '', ...props }: PressedToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`min-h-8 border-b px-2 text-[12px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 ${
        pressed ? 'border-ink font-medium text-ink' : 'border-transparent text-muted hover:text-ink'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
