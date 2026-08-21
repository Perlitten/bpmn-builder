import { useEffect, useMemo, useState } from 'react';
import { bpmnComponentRegistry } from '@bpmn/semantic-core';
import {
  ArrowLeft,
  ArrowRight,
  Circle,
  Diamond,
  FileText,
  ListTree,
  PanelsTopLeft,
  Search,
  Square,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useModal } from '../../ui/useModal';
import { TextField } from '../../ui/TextField';
import type { DiagramElement } from '../diagramElement';
import {
  catalogEnterTarget,
  enabledCatalogItems,
  flattenCatalogItems,
  stepCatalogHighlight,
} from './catalogEnter';
import { catalogForFlyout, resolveCatalogItem, type ResolvedCatalogItem } from './contextFilter';
import {
  CATEGORY_LABEL,
  PALETTE_CATEGORIES,
  iconClassFor,
  type PaletteCatalogView,
  type PaletteCategoryId,
} from './catalogPresentation';

type CatalogFlyoutProps = {
  view: PaletteCatalogView;
  query: string;
  selection: DiagramElement | null;
  hasParticipant: boolean;
  onQueryChange: (query: string) => void;
  onViewChange: (view: PaletteCatalogView) => void;
  onPick: (item: ResolvedCatalogItem) => void;
  onClose: () => void;
};

const CATEGORY_ICON: Record<PaletteCategoryId, LucideIcon> = {
  events: Circle,
  activities: Square,
  gateways: Diamond,
  flows: ArrowRight,
  participants: PanelsTopLeft,
  data: FileText,
  artifacts: ListTree,
};

const SUGGESTED = [
  { id: 'activity.task', label: 'Task', description: 'A manual or automated activity.' },
  { id: 'activity.userTask', label: 'User task', description: 'A task performed by a user.' },
  { id: 'gateway.exclusive', label: 'Exclusive gateway', description: 'Decision with exactly one path.' },
  { id: 'end.none', label: 'End event', description: 'Marks the end of a process.' },
] as const;

export function CatalogFlyout({
  view,
  query,
  selection,
  hasParticipant,
  onQueryChange,
  onViewChange,
  onPick,
  onClose,
}: CatalogFlyoutProps) {
  const { ref } = useModal({ open: true, onClose });
  const category = view === 'home' ? null : view;
  const searching = query.trim().length > 0;
  const { groups, emptyHint } = useMemo(() => {
    if (view === 'home' && !searching) return { groups: [], emptyHint: '' };
    return catalogForFlyout(category ?? 'activities', query, { selection, hasParticipant }, bpmnComponentRegistry);
  }, [category, query, searching, selection, hasParticipant, view]);
  const suggested = useMemo(
    () =>
      SUGGESTED.flatMap((copy) => {
        const item = bpmnComponentRegistry.get(copy.id);
        if (!item) return [];
        return [{ ...copy, entry: resolveCatalogItem(item, { selection, hasParticipant, searching: false }) }];
      }),
    [selection, hasParticipant],
  );
  const items = useMemo(
    () => (view === 'home' && !searching ? suggested.map(({ entry }) => entry) : flattenCatalogItems(groups)),
    [groups, searching, suggested, view],
  );
  const enabled = useMemo(() => enabledCatalogItems(items), [items]);
  const firstEnabledId = enabled[0]?.item.id ?? null;
  const [highlightedId, setHighlightedId] = useState<string | null>(firstEnabledId);

  useEffect(() => {
    setHighlightedId((current) => {
      if (current && enabled.some((entry) => entry.item.id === current)) return current;
      return firstEnabledId;
    });
  }, [enabled, firstEnabledId]);

  const createHighlighted = () => {
    const target = catalogEnterTarget(items, highlightedId);
    if (target) onPick(target);
  };

  return (
    <div
      ref={ref}
      id="palette-catalog"
      className="palette-flyout"
      role="dialog"
      aria-modal="true"
      aria-label="Add element"
      tabIndex={-1}
    >
      <div className="palette-flyout-head">
        <div className="palette-flyout-titlebar">
          <div className="palette-flyout-title">
            {category ? (
              <button type="button" className="palette-back" aria-label="Back to categories" onClick={() => onViewChange('home')}>
                <ArrowLeft size={17} aria-hidden />
              </button>
            ) : null}
            <h2>{category ? CATEGORY_LABEL[category] : 'Add element'}</h2>
          </div>
          <button type="button" className="palette-close" aria-label="Close catalog" onClick={onClose}>
            <X size={19} aria-hidden />
          </button>
        </div>
        <label className="palette-search">
          <Search size={17} strokeWidth={1.8} aria-hidden />
          <TextField
            variant="plain"
            type="search"
            value={query}
            placeholder="Search elements"
            aria-label="Search BPMN elements"
            aria-controls="palette-catalog-list"
            aria-activedescendant={highlightedId ? `catalog-item-${highlightedId}` : undefined}
            data-modal-initial-focus
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setHighlightedId(stepCatalogHighlight(enabled, highlightedId, event.key === 'ArrowDown' ? 1 : -1));
                return;
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                createHighlighted();
              }
            }}
          />
        </label>
      </div>
      <div id="palette-catalog-list" className="palette-flyout-body">
        {view === 'home' && !searching ? (
          <>
            <section className="palette-categories" aria-labelledby="palette-categories-title">
              <h3 id="palette-categories-title">Categories</h3>
              <div className="palette-category-grid">
                {PALETTE_CATEGORIES.map(({ id, label }) => {
                  const Icon = CATEGORY_ICON[id];
                  return (
                    <button key={id} type="button" className="palette-category" onClick={() => onViewChange(id)}>
                      <Icon size={25} strokeWidth={1.6} aria-hidden />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="palette-suggested" aria-labelledby="palette-suggested-title">
              <h3 id="palette-suggested-title">Suggested</h3>
              <ul>
                {suggested.map(({ label, description, entry }) => {
                  const highlighted = entry.item.id === highlightedId;
                  return (
                    <li key={entry.item.id}>
                      <button
                        type="button"
                        id={`catalog-item-${entry.item.id}`}
                        className={highlighted ? 'palette-suggested-item is-highlighted' : 'palette-suggested-item'}
                        disabled={!entry.enabled}
                        title={entry.reason ?? `Add ${label}`}
                        onMouseEnter={() => {
                          if (entry.enabled) setHighlightedId(entry.item.id);
                        }}
                        onClick={() => onPick(entry)}
                      >
                        {entry.item.id === 'gateway.exclusive' ? (
                          <Diamond className="palette-suggested-lucide" size={30} strokeWidth={1.6} aria-hidden />
                        ) : (
                          <span className={`palette-suggested-icon ${iconClassFor(entry.item)}`} aria-hidden />
                        )}
                        <span className="palette-suggested-copy">
                          <span className="palette-suggested-label">{label}</span>
                          <span className="palette-suggested-description">{entry.reason ?? description}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        ) : (
          <>
            {groups.length === 0 ? <p className="palette-flyout-empty">{emptyHint}</p> : null}
            {groups.map((group) => (
              <section className="palette-result-group" key={group.name}>
                <h3>{group.name}</h3>
                <ul>
                  {group.items.map((entry) => {
                    const highlighted = entry.item.id === highlightedId;
                    return (
                      <li key={entry.item.id}>
                        <button
                          type="button"
                          id={`catalog-item-${entry.item.id}`}
                          className={[
                            entry.enabled ? 'palette-item' : 'palette-item is-disabled',
                            highlighted ? 'is-highlighted' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          disabled={!entry.enabled}
                          title={entry.reason ?? entry.item.title}
                          onMouseEnter={() => {
                            if (entry.enabled) setHighlightedId(entry.item.id);
                          }}
                          onClick={() => onPick(entry)}
                        >
                          <span className={`palette-item-icon ${iconClassFor(entry.item)}`} aria-hidden />
                          <span className="palette-item-copy">
                            <span className="palette-item-label">{entry.item.title}</span>
                            {entry.reason ? <span className="palette-item-reason">{entry.reason}</span> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
