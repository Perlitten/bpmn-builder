import { formatSaveTime } from '../../lib/relativeTime';

type SaveStatusProps = {
  saving: boolean;
  savedAt?: string | null;
};

export function SaveStatus({ saving, savedAt }: SaveStatusProps) {
  if (saving) {
    return (
      <span className="shrink-0 text-xs text-muted" aria-live="polite">
        Saving…
      </span>
    );
  }
  if (savedAt) {
    return (
      <span className="shrink-0 text-xs text-muted" aria-live="polite">
        Saved · {formatSaveTime(savedAt)}
      </span>
    );
  }
  return <span className="sr-only">Not saved yet</span>;
}
