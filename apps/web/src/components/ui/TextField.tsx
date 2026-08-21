import type { InputHTMLAttributes } from 'react';

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  variant?: 'default' | 'plain' | 'title';
};

export function TextField({ className = '', variant = 'default', ...props }: TextFieldProps) {
  return (
    <input
      className={`ui-field ${className}`}
      data-variant={variant}
      {...props}
    />
  );
}
