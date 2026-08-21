import { memo, useSyncExternalStore } from 'react';
import type { ProcessSummary } from '@bpmn/domain';
import {
  absoluteTime,
  relativeTime,
  relativeTimeServerSnapshot,
  relativeTimeSnapshot,
  subscribeRelativeTime,
} from '../../lib/relativeTime';
import { ChromeMenu, ChromeMenuItem } from '../ui/ChromeMenu';
import { listQualitySignal } from './listQuality';
import { BpmnSchematic } from './BpmnSchematic';

type ProcessRowProps = {
  process: ProcessSummary;
  onOpen: (id: string) => void;
  onRename?: (process: ProcessSummary) => void;
  onDuplicate?: (process: ProcessSummary) => void;
  onDelete?: (process: ProcessSummary) => void;
};

export const ProcessRow = memo(function ProcessRow({ process, onOpen, onRename, onDuplicate, onDelete }: ProcessRowProps) {
  const now = useSyncExternalStore(
    subscribeRelativeTime,
    relativeTimeSnapshot,
    relativeTimeServerSnapshot,
  );
  const quality = listQualitySignal(process.quality);
  const updated = relativeTime(process.updatedAt, now);
  const metadataId = `process-${process.id}-metadata`;
  const actions = Boolean(onRename || onDuplicate || onDelete);

  return (
    <div className="relative border-b border-border">
      <button
        type="button"
        aria-label={`Open ${process.name}`}
        aria-describedby={metadataId}
        className={`grid min-h-16 w-full grid-cols-[9rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-0 bg-canvas px-4 py-3 text-left text-ink hover:bg-surface ${actions ? 'pr-16' : ''}`}
        onClick={() => onOpen(process.id)}
      >
        <span className="row-span-2 hidden min-w-0 sm:block" aria-hidden="true">
          <BpmnSchematic preview={process.preview} />
        </span>
        <span className="min-w-0 truncate text-sm font-medium text-ink">{process.name}</span>
        <time
          dateTime={process.updatedAt}
          title={absoluteTime(process.updatedAt)}
          className="whitespace-nowrap pt-0.5 text-[11px] text-muted"
        >
          {updated}
        </time>
        <span className="col-span-2 flex min-w-0 items-center gap-2 text-[11px] text-muted sm:col-span-1">
          <span className="truncate">{process.structure}</span>
          {quality ? (
            <span className="shrink-0 truncate" title={quality.title}>
              {quality.label}
            </span>
          ) : null}
        </span>
        <span id={metadataId} className="sr-only">
          {`Updated ${updated}. ${process.structure}${quality ? `. ${quality.label}` : ''}`}
        </span>
      </button>
      {actions ? (
        <div className="absolute right-2 top-2.5">
          <ChromeMenu label="•••" ariaLabel={`Actions for ${process.name}`}>
            {onRename ? <ChromeMenuItem onSelect={() => onRename(process)}>Rename</ChromeMenuItem> : null}
            {onDuplicate ? <ChromeMenuItem onSelect={() => onDuplicate(process)}>Duplicate</ChromeMenuItem> : null}
            {onDelete ? <ChromeMenuItem onSelect={() => onDelete(process)}>Delete</ChromeMenuItem> : null}
          </ChromeMenu>
        </div>
      ) : null}
    </div>
  );
});
