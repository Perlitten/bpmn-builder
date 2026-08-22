import type { ReactNode } from 'react';

type TooltipProps = {
  id: string;
  children: ReactNode;
  side?: 'bottom' | 'left' | 'right' | 'top';
};

/** Visual help for an already-labelled icon control or truncated value. */
export function Tooltip({ id, children, side = 'bottom' }: TooltipProps) {
  return (
    <span id={id} role="tooltip" className="ui-tooltip" data-side={side}>
      {children}
    </span>
  );
}
