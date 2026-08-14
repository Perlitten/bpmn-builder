import { Diamond, Hand, MousePointer2, Plus } from 'lucide-react';
import { bpmnComponentRegistry } from '@bpmn/semantic-core';
import { useMemo } from 'react';
import type { DiagramElement } from '../diagramElement';
import { iconClassFor, type PaletteCatalogView } from './catalogPresentation';
import { CatalogFlyout } from './CatalogFlyout';
import { resolveCatalogItem, type ResolvedCatalogItem } from './contextFilter';
import './palette.css';

type ToolId = 'select' | 'pan';

type PaletteRailProps = {
  tool: ToolId;
  catalogView: PaletteCatalogView | null;
  query: string;
  selection: DiagramElement | null;
  hasParticipant: boolean;
  onTool: (tool: ToolId, event: React.MouseEvent) => void;
  onOpenCatalog: (view: PaletteCatalogView) => void;
  onQueryChange: (query: string) => void;
  onPick: (item: ResolvedCatalogItem) => void;
  onCloseCatalog: () => void;
};

const TOOLS: Array<{ id: ToolId; label: string; icon: typeof MousePointer2 }> = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'pan', label: 'Pan', icon: Hand },
];

const RECENT_IDS = ['activity.task', 'start.none', 'gateway.exclusive'] as const;

export function PaletteRail({
  tool,
  catalogView,
  query,
  selection,
  hasParticipant,
  onTool,
  onOpenCatalog,
  onQueryChange,
  onPick,
  onCloseCatalog,
}: PaletteRailProps) {
  const recent = useMemo(
    () =>
      RECENT_IDS.flatMap((id) => {
        const item = bpmnComponentRegistry.get(id);
        return item ? [resolveCatalogItem(item, { selection, hasParticipant, searching: false })] : [];
      }),
    [selection, hasParticipant],
  );

  return (
    <div className={catalogView ? 'palette-rail is-catalog-open' : 'palette-rail'} role="toolbar" aria-label="Process modeling">
      {TOOLS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={tool === id ? 'palette-rail-btn is-tool-active' : 'palette-rail-btn'}
          aria-label={label}
          title={label}
          aria-pressed={tool === id}
          onClick={(event) => onTool(id, event)}
        >
          <Icon size={22} strokeWidth={1.7} aria-hidden />
          <span className="palette-rail-label">{label}</span>
        </button>
      ))}
      <span className="palette-rail-rule" aria-hidden />
      <button
        type="button"
        className={catalogView ? 'palette-rail-btn palette-add-btn is-active' : 'palette-rail-btn palette-add-btn'}
        aria-label="Add element"
        title="Add element"
        aria-haspopup="dialog"
        aria-expanded={Boolean(catalogView)}
        aria-controls={catalogView ? 'palette-catalog' : undefined}
        onClick={() => (catalogView ? onCloseCatalog() : onOpenCatalog('home'))}
      >
        <Plus size={28} strokeWidth={1.5} aria-hidden />
        <span className="palette-rail-label">Add</span>
      </button>
      <span className="palette-rail-rule" aria-hidden />
      <span className="palette-recent-title">Recent</span>
      {recent.map((entry) => (
        <button
          key={entry.item.id}
          type="button"
          className="palette-recent-btn"
          aria-label={`Add ${entry.item.title}`}
          title={entry.reason ?? `Add ${entry.item.title}`}
          disabled={!entry.enabled}
          onClick={() => onPick(entry)}
        >
          {entry.item.id === 'gateway.exclusive' ? (
            <Diamond className="palette-recent-lucide" size={27} strokeWidth={1.6} aria-hidden />
          ) : (
            <span className={`palette-recent-icon ${iconClassFor(entry.item)}`} aria-hidden />
          )}
        </button>
      ))}
      {catalogView ? (
        <>
          <button
            type="button"
            className="palette-sheet-dismiss"
            aria-label="Close catalog"
            onClick={onCloseCatalog}
          />
          <CatalogFlyout
            view={catalogView}
            query={query}
            selection={selection}
            hasParticipant={hasParticipant}
            onQueryChange={onQueryChange}
            onViewChange={onOpenCatalog}
            onPick={onPick}
            onClose={onCloseCatalog}
          />
        </>
      ) : null}
    </div>
  );
}
