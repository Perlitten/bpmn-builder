import { useEffect, useId, useState } from 'react';
import { copyProcessName, PROCESS_NAME_MAX, type ProcessSummary } from '@bpmn/domain';
import { Button } from '../ui/Button';
import { DialogActions, DialogBackdrop, DialogSurface } from '../ui/Dialog';
import { TextField } from '../ui/TextField';
import { useModal } from '../ui/useModal';
import { duplicateRequestFromDialog } from './duplicateRequest';

type DuplicateProcessDialogProps = {
  process: ProcessSummary | null;
  busy: boolean;
  error: string | null;
  onConfirm: (name: string) => void;
  onClose: () => void;
};

export function DuplicateProcessDialog({
  process,
  busy,
  error,
  onConfirm,
  onClose,
}: DuplicateProcessDialogProps) {
  const [name, setName] = useState(process ? copyProcessName(process.name) : '');
  const titleId = useId();
  const errorId = useId();
  const { ref } = useModal({
    open: Boolean(process),
    onClose: () => {
      if (!busy) onClose();
    },
  });

  useEffect(() => {
    setName(process ? copyProcessName(process.name) : '');
  }, [process]);

  if (!process) return null;
  const trimmed = name.trim();

  return (
    <DialogBackdrop>
      <DialogSurface
        ref={ref}
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const request = duplicateRequestFromDialog({ action: 'confirm', name });
            if (request && !busy) onConfirm(request.name);
          }}
        >
          <h2 id={titleId} className="ui-dialog-title">
            Duplicate process
          </h2>
          <label className="mt-4 block">
            <span className="ui-field-label">Name</span>
            <TextField
              value={name}
              maxLength={PROCESS_NAME_MAX}
              autoComplete="off"
              data-modal-initial-focus
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {error ? (
            <p id={errorId} className="ui-field-message" data-tone="danger" role="alert">
              {error}
            </p>
          ) : null}
          <DialogActions>
            <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="accent"
              size="sm"
              type="submit"
              disabled={!trimmed}
              loading={busy}
              loadingLabel="Copying…"
            >
              Make a copy
            </Button>
          </DialogActions>
        </form>
      </DialogSurface>
    </DialogBackdrop>
  );
}
