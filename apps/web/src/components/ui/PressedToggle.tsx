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
      className={`ui-tab ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
