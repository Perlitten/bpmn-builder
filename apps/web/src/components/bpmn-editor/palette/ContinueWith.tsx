import { useMemo, useState } from 'react';
import { bpmnComponentRegistry, type BpmnComponentDefinition } from '@bpmn/semantic-core';
import type { DiagramElement } from '../diagramElement';
import { resolveCatalogItem } from './contextFilter';

type ContinueAction = {
  id: 'task' | 'decision' | 'parallel' | 'wait' | 'end';
  label: string;
  catalogId?: string;
  chooserIds?: readonly string[];
};

const CONTINUE_ACTIONS: ContinueAction[] = [
  { id: 'task', label: 'Task', catalogId: 'activity.task' },
  {
    id: 'decision',
    label: 'Decision',
    chooserIds: ['gateway.exclusive', 'gateway.inclusive', 'gateway.eventBased'],
  },
  { id: 'parallel', label: 'Parallel', catalogId: 'gateway.parallel' },
  {
    id: 'wait',
    label: 'Wait for event',
    chooserIds: ['gateway.eventBased', 'intermediate.catch.timer', 'intermediate.catch.message'],
  },
  { id: 'end', label: 'End', catalogId: 'end.none' },
];

type ContinueWithProps = {
  source: DiagramElement;
  hasParticipant: boolean;
  anchor: { left: number; top: number };
  onPick: (item: BpmnComponentDefinition, event: React.MouseEvent) => void;
};

export function ContinueWith({ source, hasParticipant, anchor, onPick }: ContinueWithProps) {
  const [open, setOpen] = useState(false);
  const [chooser, setChooser] = useState<'decision' | 'wait' | null>(null);
  const ctx = { selection: source, hasParticipant, searching: true };

  const actions = useMemo(
    () =>
      CONTINUE_ACTIONS.map((action) => {
        if (action.catalogId) {
          const item = bpmnComponentRegistry.get(action.catalogId);
          const resolved = item ? resolveCatalogItem(item, ctx) : null;
          return { action, resolved, chooserItems: [] as ReturnType<typeof resolveCatalogItem>[] };
        }
        const chooserItems = (action.chooserIds ?? [])
          .map((id) => bpmnComponentRegistry.get(id))
          .filter((item): item is BpmnComponentDefinition => !!item)
          .map((item) => resolveCatalogItem(item, ctx));
        return { action, resolved: null, chooserItems };
      }),
    [source, hasParticipant],
  );

  return (
    <>
      <button
        type="button"
        className={open ? 'continue-plus is-open' : 'continue-plus'}
        style={{ left: anchor.left, top: anchor.top }}
        aria-label="Continue with"
        title="Continue with"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? 'continue-menu' : undefined}
        onClick={() => {
          setOpen((next) => !next);
          setChooser(null);
        }}
      >
        +
      </button>
      {open ? (
        <div
          id="continue-menu"
          className="continue-menu"
          style={{ left: anchor.left + 40, top: anchor.top - 12 }}
          role="group"
          aria-label="Continue with"
        >
          <div className="continue-menu-title">Continue with</div>
          {actions.map(({ action, resolved, chooserItems }) => {
            if (action.chooserIds) {
              const expanded = chooser === action.id;
              return (
                <div key={action.id}>
                  <button
                    type="button"
                    title={action.label}
                    aria-expanded={expanded}
                    aria-haspopup="true"
                    onClick={() =>
                      setChooser(
                        expanded ? null : action.id === 'decision' || action.id === 'wait' ? action.id : null,
                      )
                    }
                  >
                    {action.label}
                  </button>
                  {expanded ? (
                    <div className="continue-chooser">
                      {chooserItems.map((entry) => (
                        <button
                          key={entry.item.id}
                          type="button"
                          disabled={!entry.enabled}
                          title={entry.reason ?? entry.item.title}
                          onClick={(event) => {
                            onPick(entry.item, event);
                            setOpen(false);
                            setChooser(null);
                          }}
                        >
                          {entry.item.title}
                          {entry.reason ? ` — ${entry.reason}` : ''}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            }
            return (
              <button
                key={action.id}
                type="button"
                disabled={!resolved?.enabled}
                title={resolved?.reason ?? action.label}
                onClick={(event) => {
                  if (!resolved) return;
                  onPick(resolved.item, event);
                  setOpen(false);
                }}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
