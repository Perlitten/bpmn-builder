import type { SelectHTMLAttributes } from 'react';

export function SelectField({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`ui-select ${className}`} {...props} />;
}
