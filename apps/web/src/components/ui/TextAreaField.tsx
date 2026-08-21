import { forwardRef, type TextareaHTMLAttributes } from 'react';

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextAreaField({ className = '', ...props }, ref) {
    return <textarea ref={ref} className={`ui-textarea ${className}`} {...props} />;
  },
);
