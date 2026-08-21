import { formatSaveTime } from '../../lib/relativeTime';

type SaveStatusProps = {
  saving: boolean;
  savedAt?: string | null;
};

export function SaveStatus({ saving, savedAt }: SaveStatusProps) {
  if (saving) {
    return (
      <span className="ui-save-status" aria-live="polite">
        Saving…
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
