import { useId } from 'react';
import { Button } from './Button';
import { DialogActions, DialogBackdrop, DialogSurface } from './Dialog';
import { useModal } from './useModal';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  role?: 'dialog' | 'alertdialog';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  role = 'dialog',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const { ref } = useModal({ open, onClose: onCancel });

  if (!open) return null;

  return (
    <DialogBackdrop>
      <DialogSurface
        ref={ref}
        role={role}
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <h2 id={titleId} className="ui-dialog-title">
          {title}
        </h2>
        <p id={bodyId} className="ui-dialog-body">
          {body}
        </p>
        <DialogActions>
          <Button variant="ghost" size="sm" data-modal-initial-focus disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={role === 'alertdialog' && title.toLowerCase().startsWith('delete') ? 'danger' : 'accent'}
            size="sm"
            loading={busy}
            loadingLabel={`${confirmLabel}…`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogActions>
      </DialogSurface>
    </DialogBackdrop>
  );
}
