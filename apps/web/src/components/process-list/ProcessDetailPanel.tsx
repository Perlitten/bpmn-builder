import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ProcessSummary } from '@bpmn/domain';
import { ArrowRight, ChevronLeft, MoreHorizontal, Pencil, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import {
  absoluteTime,
  relativeTime,
  relativeTimeServerSnapshot,
  relativeTimeSnapshot,
  subscribeRelativeTime,
} from '../../lib/relativeTime';
import { Button } from '../ui/Button';
import { ChromeMenu, ChromeMenuItem } from '../ui/ChromeMenu';
import { IconButton } from '../ui/IconButton';
import { BpmnSchematic } from './BpmnSchematic';
import { listQualitySignal } from './listQuality';

type ProcessDetailPanelProps = {
  process: ProcessSummary;
  kind: 'process' | 'template';
  busy?: boolean;
  exporting?: boolean;
  onBack?: () => void;
  onClose?: () => void;
  onOpenEditor?: (id: string) => void;
  onUseTemplate?: (process: ProcessSummary) => void;
  onDuplicate?: (process: ProcessSummary) => void;
  onExport?: (process: ProcessSummary) => void;
  onRename?: (process: ProcessSummary) => void;
  onDelete?: (process: ProcessSummary) => void;
  onRegenerate?: (description: string) => void;
};

type StructureMetric = { value: string; label: string };

function structureMetrics(process: ProcessSummary): StructureMetric[] {
  const metrics = process.structure
    .split('·')
    .map((part) => part.trim())
    .flatMap((part) => {
      const match = /^(\d+)\s+(.+)$/.exec(part);
      return match ? [{ value: match[1], label: match[2] }] : [];
    });
  return metrics.slice(0, 6);
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(new Date(value));
}

export function ProcessDetailPanel({
  process,
  kind,
  busy = false,
  exporting = false,
  onBack,
  onClose,
  onOpenEditor,
  onUseTemplate,
  onDuplicate,
  onExport,
  onRename,
  onDelete,
  onRegenerate,
}: ProcessDetailPanelProps) {
  const now = useSyncExternalStore(
    subscribeRelativeTime,
    relativeTimeSnapshot,
    relativeTimeServerSnapshot,
  );
  const [zoom, setZoom] = useState(1);
  const [compactLayout, setCompactLayout] = useState(false);
  const quality = listQualitySignal(process.quality);
  const metrics = structureMetrics(process);
  const updated = relativeTime(process.updatedAt, now);
  const canManage = !process.builtin && Boolean(onRename || onDelete);

  useEffect(() => setZoom(1), [process.id]);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const sync = () => setCompactLayout(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return (
    <article className="process-detail" aria-label={`Preview of ${process.name}`}>
      <header className="process-detail-header">
        {onBack ? (
          <button type="button" className="process-detail-back" aria-label="Back to processes" onClick={onBack}>
            <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
        <span className="process-detail-title-group">
          <strong title={process.name}>{process.name}</strong>
          <span>
            updated <time dateTime={process.updatedAt} title={absoluteTime(process.updatedAt)}>{updated}</time>
            {' · '}created {shortDate(process.createdAt)} · v{process.version}
          </span>
        </span>
        <div className="process-detail-actions">
          {kind === 'process' && onOpenEditor ? (
            <Button variant="accentSolid" size="sm" onClick={() => onOpenEditor(process.id)}>
              Open in editor <ArrowRight size={12} strokeWidth={2} aria-hidden="true" />
            </Button>
          ) : onUseTemplate ? (
            <Button variant="accentSolid" size="sm" disabled={busy} onClick={() => onUseTemplate(process)}>
              Use template <ArrowRight size={12} strokeWidth={2} aria-hidden="true" />
            </Button>
          ) : null}
          {kind === 'process' && onDuplicate ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onDuplicate(process)}>
              Duplicate
            </Button>
          ) : null}
          {onExport && !process.builtin ? (
            <Button variant="outline" size="sm" loading={exporting} disabled={busy} onClick={() => onExport(process)}>
              Export
            </Button>
          ) : null}
          {canManage ? (
            <ChromeMenu
              label={<MoreHorizontal size={16} aria-hidden="true" />}
              ariaLabel={`More actions for ${process.name}`}
              menuClassName="process-detail-menu"
            >
              {onRename ? (
                <ChromeMenuItem icon={<Pencil size={14} strokeWidth={1.8} />} onSelect={() => onRename(process)}>
                  Rename
                </ChromeMenuItem>
              ) : null}
              {onDelete ? (
                <ChromeMenuItem
                  icon={<Trash2 size={14} strokeWidth={1.8} />}
                  tone="danger"
                  onSelect={() => onDelete(process)}
                >
                  Delete
                </ChromeMenuItem>
              ) : null}
            </ChromeMenu>
          ) : null}
          {onClose ? (
            <IconButton label="Close preview" className="process-detail-close" onClick={onClose}>
              <X size={16} strokeWidth={1.8} aria-hidden="true" />
            </IconButton>
          ) : null}
        </div>
      </header>

      <div className="process-detail-canvas">
        <span className="process-readonly-badge process-readonly-desktop">Read only preview</span>
        <span className="process-readonly-badge process-readonly-mobile">Fit · {process.preview.nodes.length} shapes</span>
        <div className="process-schematic-stage">
          <BpmnSchematic
            key={process.id}
            preview={process.preview}
            variant="detail"
            zoom={zoom}
            compactLayout={compactLayout}
            className="process-detail-schematic"
          />
        </div>
        <div className="process-preview-zoom" aria-label="Preview zoom">
          <button type="button" aria-label="Zoom out" disabled={zoom <= 0.7} onClick={() => setZoom((value) => Math.max(0.7, value - 0.15))}>
            <ZoomOut size={13} aria-hidden="true" />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" disabled={zoom >= 1.3} onClick={() => setZoom((value) => Math.min(1.3, value + 0.15))}>
            <ZoomIn size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      {quality ? (
        <section className="process-detail-mobile-alert" data-tone={quality.tone} aria-label="BPMN findings">
          <span className="process-detail-alert-label">
            <span className="process-quality-dot" data-tone={quality.tone} aria-hidden="true" />
            {quality.label} · {quality.title}
          </span>
          <p>{qualityExplanation(quality.tone)}</p>
          {onOpenEditor ? (
            <Button variant="outline" size="sm" onClick={() => onOpenEditor(process.id)}>Show in diagram</Button>
          ) : null}
        </section>
      ) : null}

      <footer className="process-detail-footer">
        <section className="process-detail-structure" aria-labelledby={`structure-${process.id}`}>
          <span id={`structure-${process.id}`} className="process-section-label">Structure</span>
          <div className="process-mobile-shape-count">
            <strong>{process.preview.nodes.length}</strong><span>shapes</span>
          </div>
          <div className="process-structure-grid">
            {metrics.length ? metrics.map((metric) => (
              <span key={`${metric.value}-${metric.label}`}>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </span>
            )) : (
              <span><strong>0</strong><span>shapes</span></span>
            )}
          </div>
        </section>
        <section className="process-detail-checks" aria-labelledby={`checks-${process.id}`}>
          <span className="process-detail-checks-head">
            <span id={`checks-${process.id}`} className="process-section-label">Checks</span>
            <span className="process-check-badge" data-tone={quality?.tone ?? 'clean'}>
              <span className="process-quality-dot" data-tone={quality?.tone ?? 'clean'} aria-hidden="true" />
              {quality?.label ?? 'no findings'}
            </span>
          </span>
          <p>{quality ? qualityExplanation(quality.tone) : 'No structural or execution findings were reported for this process.'}</p>
          <span className="process-check-profile">BPMN 2.0 · executable profile</span>
        </section>
        <section className="process-detail-description" aria-labelledby={`description-${process.id}`}>
          <span id={`description-${process.id}`} className="process-section-label process-description-desktop">
            {process.description ? 'Description' : 'Process note'}
          </span>
          <span className="process-section-label process-description-mobile">
            {process.description ? 'Generated from' : 'Process note'}
          </span>
          <p>{process.description ?? 'No source description was saved for this process.'}</p>
          {process.description && kind === 'process' && onRegenerate ? (
            <Button variant="outline" size="sm" onClick={() => onRegenerate(process.description!)}>
              Re-generate from this text
            </Button>
          ) : null}
          <span className="process-detail-mobile-meta">
            Updated <time dateTime={process.updatedAt} title={absoluteTime(process.updatedAt)}>{updated}</time>
          </span>
        </section>
      </footer>

      <div className="process-detail-mobile-actions">
        {onExport && !process.builtin ? (
          <Button variant="outline" size="md" loading={exporting} disabled={busy} onClick={() => onExport(process)}>Export</Button>
        ) : null}
        {kind === 'process' && onOpenEditor ? (
          <Button variant="accentSolid" size="md" disabled={busy} onClick={() => onOpenEditor(process.id)}>
            Open in editor <ArrowRight size={13} aria-hidden="true" />
          </Button>
        ) : onUseTemplate ? (
          <Button variant="accentSolid" size="md" disabled={busy} onClick={() => onUseTemplate(process)}>Use template</Button>
        ) : null}
        <span>Phones review. Desktops edit.</span>
      </div>
    </article>
  );
}

function qualityExplanation(tone: 'error' | 'warning' | 'style'): string {
  if (tone === 'error') return 'The process has a structural BPMN error that must be resolved before execution.';
  if (tone === 'warning') return 'The process can be opened, but its execution or quality checks need review.';
  return 'The process is structurally valid; style guidance remains to review.';
}
