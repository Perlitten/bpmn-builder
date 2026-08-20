import { memo, useSyncExternalStore } from 'react';
import type { ProcessSummary } from '@bpmn/domain';
import { DEFAULT_EXECUTION_PROFILE, lintProcess, type LintResult } from '@bpmn/rules';
import { previewBpmn, previewStructure } from '../../lib/bpmnPreview';
import {
  absoluteTime,
  relativeTime,
  relativeTimeServerSnapshot,
  relativeTimeSnapshot,
  subscribeRelativeTime,
} from '../../lib/relativeTime';
import { ChromeMenu, ChromeMenuItem } from '../ui/ChromeMenu';
import { listQualitySignal } from './listQuality';

type ProcessRowProps = {
  process: ProcessSummary;
  onOpen: (id: string) => void;
  onRename?: (process: ProcessSummary) => void;
  onDuplicate?: (process: ProcessSummary) => void;
  onDelete?: (process: ProcessSummary) => void;
};

type RowAnalysis = { lint: LintResult; structure: string };

const ROW_CACHE_LIMIT = 100;
const rowAnalysisCache = new Map<string, RowAnalysis>();

function analyzeRow(xml: string): RowAnalysis {
  const cached = rowAnalysisCache.get(xml);
  if (cached) {
    rowAnalysisCache.delete(xml);
    rowAnalysisCache.set(xml, cached);
    return cached;
  }
  const preview = previewBpmn(xml);
  const result = {
    lint: lintProcess(xml, { executionProfile: DEFAULT_EXECUTION_PROFILE, geometry: 'skip' }),
    structure: previewStructure(preview),
  };
  rowAnalysisCache.set(xml, result);
  if (rowAnalysisCache.size > ROW_CACHE_LIMIT) {
    const oldest = rowAnalysisCache.keys().next().value;
    if (oldest) rowAnalysisCache.delete(oldest);
  }
  return result;
}

export const ProcessRow = memo(function ProcessRow({ process, onOpen, onRename, onDuplicate, onDelete }: ProcessRowProps) {
  const now = useSyncExternalStore(
    subscribeRelativeTime,
    relativeTimeSnapshot,
    relativeTimeServerSnapshot,
  );
  const { lint, structure } = analyzeRow(process.bpmnXml);
  const quality = listQualitySignal(lint);
  const actions = Boolean(onRename || onDuplicate || onDelete);

  return (
    <div className="relative border-b border-border">
      <button
        type="button"
        aria-label={`Open ${process.name}`}
        className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-surface ${actions ? 'pr-16' : ''}`}
        onClick={() => onOpen(process.id)}
      >
        <span className="min-w-0 truncate text-sm font-medium text-ink">{process.name}</span>
        <time
          dateTime={process.updatedAt}
          title={absoluteTime(process.updatedAt)}
          className="whitespace-nowrap pt-0.5 text-[11px] text-muted"
        >
          {relativeTime(process.updatedAt, now)}
        </time>
        <span className="col-span-2 flex min-w-0 items-center gap-2 text-[11px] text-muted">
          <span className="truncate">{structure}</span>
          {quality ? (
            <span className="shrink-0 truncate" title={quality.title}>
              {quality.label}
            </span>
          ) : null}
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
