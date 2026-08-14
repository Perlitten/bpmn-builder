type SaveStatusProps = {
  saving: boolean;
  savedAt?: string | null;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

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
        Saved · {formatTime(savedAt)}
      </span>
    );
  }
  return <span className="sr-only">Not saved yet</span>;
}
