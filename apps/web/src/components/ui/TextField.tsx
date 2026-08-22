import { forwardRef, type InputHTMLAttributes } from 'react';

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  variant?: 'default' | 'plain' | 'title';
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField({ className = '', variant = 'default', ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`ui-field ${className}`}
        data-variant={variant}
        {...props}
      />
    );
  },
);
