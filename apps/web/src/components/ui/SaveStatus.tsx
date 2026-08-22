import { formatSaveTime } from '../../lib/relativeTime';
import type { ProcessSavePhase } from '../../lib/processSaveQueue';

type SaveStatusProps = {
  phase: ProcessSavePhase;
  savedAt?: string | null;
};

export function SaveStatus({ phase, savedAt }: SaveStatusProps) {
  let text = 'Not saved yet';
  let danger = false;
  let live: 'assertive' | 'polite' = 'polite';
  if (phase === 'saving') {
    text = 'Saving…';
  } else if (phase === 'dirty') {
    text = 'Unsaved changes';
  } else if (phase === 'offline') {
    text = 'Offline · saved locally';
  } else if (phase === 'failed') {
    text = 'Save failed · stored locally';
    danger = true;
  } else if (phase === 'conflict') {
    text = 'Save conflict';
    danger = true;
    live = 'assertive';
  } else if (savedAt) {
    text = `Saved · ${formatSaveTime(savedAt)}`;
  }

  return (
    <span className={`ui-save-status${danger ? ' text-danger' : ''}`} aria-live={live}>
      {text}
    </span>
  );
}
