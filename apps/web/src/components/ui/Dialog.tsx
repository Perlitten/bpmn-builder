import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

export function DialogBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="ui-dialog-backdrop" role="presentation">
      {children}
    </div>
  );
}

type DialogSurfaceProps = HTMLAttributes<HTMLDivElement> & {
  role?: 'dialog' | 'alertdialog';
};

export const DialogSurface = forwardRef<HTMLDivElement, DialogSurfaceProps>(function DialogSurface(
  { className = '', role = 'dialog', children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role={role}
      aria-modal="true"
      tabIndex={-1}
      className={`ui-dialog ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="ui-dialog-actions">{children}</div>;
}
