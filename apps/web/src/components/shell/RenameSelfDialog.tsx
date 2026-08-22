import { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import { updateProfileName } from '../../lib/auth';
import { Button, DialogActions, DialogBackdrop, DialogSurface, IconButton, TextField } from '../ui';
import { useModal } from '../ui/useModal';

type RenameSelfDialogProps = {
  open: boolean;
  initialName: string;
  onClose: () => void;
  onSaved: (name: string) => void;
};

export function RenameSelfDialog({ open, initialName, onClose, onSaved }: RenameSelfDialogProps) {
  const titleId = useId();
  const { ref } = useModal({ open, onClose });
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError(null);
    }
  }, [open, initialName]);

  if (!open) return null;

  return (
    <DialogBackdrop>
      <DialogSurface ref={ref} aria-labelledby={titleId}>
        <header className="feedback-dialog-header">
          <h2 id={titleId} className="ui-dialog-title">Rename yourself</h2>
          <IconButton label="Close rename dialog" onClick={onClose}>
            <X size={16} aria-hidden />
          </IconButton>
        </header>
        <form onSubmit={(event) => {
          event.preventDefault();
          const next = name.trim();
          if (!next) {
            setError('Name cannot be empty.');
            return;
          }
          setBusy(true);
          setError(null);
          void updateProfileName(next).then(() => {
            onSaved(next);
            onClose();
          }).catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : 'Could not update your name.');
          }).finally(() => setBusy(false));
        }}>
          <label className="feedback-field">
            <span className="ui-field-label">Display name</span>
            <TextField autoFocus value={name} maxLength={80} aria-invalid={Boolean(error) || undefined} onChange={(event) => setName(event.target.value)} />
          </label>
          {error ? <p className="ui-field-message" data-tone="danger" role="alert">{error}</p> : null}
          <DialogActions>
            <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>Cancel</Button>
            <Button variant="accentSolid" size="sm" type="submit" loading={busy} loadingLabel="Saving…">Save name</Button>
          </DialogActions>
        </form>
      </DialogSurface>
    </DialogBackdrop>
  );
}
