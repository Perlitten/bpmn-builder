import type { TextareaHTMLAttributes } from 'react';

export function TextAreaField({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`ui-textarea ${className}`} {...props} />;
}
