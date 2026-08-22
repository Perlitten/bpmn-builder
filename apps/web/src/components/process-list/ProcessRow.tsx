import { memo, useSyncExternalStore, type Ref } from 'react';
import type { ProcessSummary } from '@bpmn/domain';
import { Copy, Download, Edit3, MoreHorizontal, Trash2, ChevronRight } from 'lucide-react';
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
  onExport?: (process: ProcessSummary) => void;
  selected?: boolean;
  focusRef?: Ref<HTMLButtonElement>;
};

export const ProcessRow = memo(function ProcessRow({
  process,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onExport,
  selected = false,
  focusRef,
}: ProcessRowProps) {
  const now = useSyncExternalStore(
    subscribeRelativeTime,
    relativeTimeSnapshot,
    relativeTimeServerSnapshot,
  );
  const quality = listQualitySignal(process.quality);
  const updated = relativeTime(process.updatedAt, now);
  const metadataId = `process-${process.id}-metadata`;
  const actions = Boolean(onRename || onDuplicate || onExport || onDelete);

  return (
    <div className="process-index-row-wrap relative" data-process-id={process.id}>
      <button
        ref={focusRef}
        type="button"
        aria-label={`Preview ${process.name}`}
        aria-describedby={metadataId}
        aria-pressed={selected}
        className={`process-index-row ${actions ? 'has-actions' : ''}`}
        data-selected={selected || undefined}
        data-quality={quality?.tone}
        onClick={() => onOpen(process.id)}
      >
        <span className="process-index-copy">
          <span className="process-index-name">{process.name}</span>
          <span className="process-index-structure">{process.structure}</span>
          <span className="process-index-mobile-meta">
            <time dateTime={process.updatedAt} title={absoluteTime(process.updatedAt)}>{updated}</time>
            {quality ? (
              <span className="process-quality-badge" data-tone={quality.tone} title={quality.title}>
                <span className="process-quality-dot" aria-hidden="true" />
                {quality.label}
              </span>
            ) : null}
          </span>
        </span>
        <span className="process-index-side">
          <time dateTime={process.updatedAt} title={absoluteTime(process.updatedAt)}>{updated}</time>
          {quality ? (
            <span className="process-quality-dot" data-tone={quality.tone} title={quality.label} aria-hidden="true" />
          ) : null}
        </span>
        <ChevronRight className="process-index-chevron" size={16} strokeWidth={2} aria-hidden="true" />
        <span id={metadataId} className="sr-only">
          {`Updated ${updated}. ${process.structure}${quality ? `. ${quality.label}` : ''}`}
        </span>
        <span className="process-index-preview" aria-hidden="true">
          <BpmnSchematic preview={process.preview} />
        </span>
      </button>
      {actions ? (
        <div className="process-index-actions">
          <ChromeMenu
            label={<MoreHorizontal size={16} aria-hidden="true" />}
            ariaLabel={`Actions for ${process.name}`}
            menuClassName="process-row-menu"
          >
            {onRename ? <ChromeMenuItem icon={<Edit3 size={14} />} onSelect={() => onRename(process)}>Rename</ChromeMenuItem> : null}
            {onDuplicate ? <ChromeMenuItem icon={<Copy size={14} />} onSelect={() => onDuplicate(process)}>Duplicate</ChromeMenuItem> : null}
            {onExport ? <ChromeMenuItem icon={<Download size={14} />} onSelect={() => onExport(process)}>Export BPMN</ChromeMenuItem> : null}
            {onDelete ? <ChromeMenuItem icon={<Trash2 size={14} />} tone="danger" onSelect={() => onDelete(process)}>Delete</ChromeMenuItem> : null}
          </ChromeMenu>
        </div>
      ) : null}
    </div>
  );
});
