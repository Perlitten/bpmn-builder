import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button } from './Button';

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string;
  children: ReactNode;
  variant?: 'accent' | 'danger' | 'ghost' | 'outline';
};

export function IconButton({ label, className = '', children, variant = 'ghost', ...props }: IconButtonProps) {
  return (
    <Button
      variant={variant}
      size="sm"
      className={`ui-icon-button ${className}`}
      aria-label={label}
      title={props.title ?? label}
      {...props}
    >
      {children}
    </Button>
  );
}
