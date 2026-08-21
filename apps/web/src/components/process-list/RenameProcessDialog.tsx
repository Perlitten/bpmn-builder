import { useEffect, useId, useState } from 'react';
import type { ProcessSummary } from '@bpmn/domain';
import { Button } from '../ui/Button';
import { DialogActions, DialogBackdrop, DialogSurface } from '../ui/Dialog';
import { TextField } from '../ui/TextField';
import { useModal } from '../ui/useModal';

type RenameProcessDialogProps = {
  process: ProcessSummary | null;
  busy: boolean;
  error: string | null;
  onRename: (name: string) => void;
  onClose: () => void;
};

export function RenameProcessDialog({
  process,
  busy,
  error,
  onRename,
  onClose,
}: RenameProcessDialogProps) {
  const [name, setName] = useState('');
  const titleId = useId();
  const errorId = useId();
  const { ref } = useModal({
    open: Boolean(process),
    onClose: () => {
      if (!busy) onClose();
    },
  });

  useEffect(() => {
    setName(process?.name ?? '');
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
            if (trimmed && trimmed !== process.name && !busy) onRename(trimmed);
          }}
        >
          <h2 id={titleId} className="ui-dialog-title">
            Rename process
          </h2>
          <label className="mt-4 block">
            <span className="ui-field-label">Name</span>
            <TextField
              value={name}
              maxLength={200}
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
              disabled={!trimmed || trimmed === process.name}
              loading={busy}
              loadingLabel="Renaming…"
            >
              Rename
            </Button>
          </DialogActions>
        </form>
      </DialogSurface>
    </DialogBackdrop>
  );
}
