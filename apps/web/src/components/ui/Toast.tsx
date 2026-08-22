import { useEffect, useRef } from 'react';

type ToastProps = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  durationMs?: number;
};

export function Toast({ message, actionLabel, onAction, onDismiss, durationMs = 4_000 }: ToastProps) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const timer = window.setTimeout(() => onDismissRef.current(), durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, message]);

  return (
    <div className="ui-toast" role="status">
      <span>{message}</span>
      {actionLabel && onAction ? (
        <button
          type="button"
          className="ui-toast-action"
          onClick={() => {
            onAction();
            onDismiss();
          }}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
