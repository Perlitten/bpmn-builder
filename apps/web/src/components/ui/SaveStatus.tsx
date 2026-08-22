import { formatSaveTime } from '../../lib/relativeTime';
import type { ProcessSavePhase } from '../../lib/processSaveQueue';

type SaveStatusProps = {
  phase: ProcessSavePhase;
  savedAt?: string | null;
};

export function SaveStatus({ phase, savedAt }: SaveStatusProps) {
  if (phase === 'saving') {
    return (
      <span className="ui-save-status" aria-live="polite">
        Saving…
      </span>
    );
  }
  if (phase === 'dirty') {
    return (
      <span className="ui-save-status" aria-live="polite">
        Unsaved changes
      </span>
    );
  }
  if (phase === 'offline') {
    return (
      <span className="ui-save-status" aria-live="polite">
        Offline · saved locally
      </span>
    );
  }
  if (phase === 'failed') {
    return (
      <span className="ui-save-status text-danger" aria-live="polite">
        Save failed · stored locally
      </span>
    );
  }
  if (phase === 'conflict') {
    return (
      <span className="ui-save-status text-danger" aria-live="assertive">
        Save conflict
      </span>
    );
  }
  if (savedAt) {
    return (
      <span className="ui-save-status" aria-live="polite">
        Saved · {formatSaveTime(savedAt)}
      </span>
    );
  }
  return <span className="sr-only">Not saved yet</span>;
}
