import { useMemo, useState } from 'react';
import { bpmnComponentRegistry, type BpmnComponentDefinition } from '@bpmn/semantic-core';
import type { DiagramElement } from '../diagramElement';
import { resolveCatalogItem } from './contextFilter';
import type { BranchChoice, InsertTarget } from './insertTarget';

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
  /** Known target when the `+` sits on one edge. */
  target?: InsertTarget;
  /** Branches to choose from when the source splits. */
  choices?: readonly BranchChoice[];
  onPick: (item: BpmnComponentDefinition, event: React.MouseEvent, target?: InsertTarget) => void;
};

export function ContinueWith({ source, hasParticipant, anchor, target, choices, onPick }: ContinueWithProps) {
  const [open, setOpen] = useState(false);
  const [chooser, setChooser] = useState<'decision' | 'wait' | null>(null);
  const [pending, setPending] = useState<BpmnComponentDefinition | null>(null);
  const ctx = { selection: source, hasParticipant, searching: true };
  const branches = choices ?? [];

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

  const close = () => {
    setOpen(false);
    setChooser(null);
    setPending(null);
  };

  /** A split needs a branch before the kernel can place anything. */
  const take = (item: BpmnComponentDefinition, event: React.MouseEvent) => {
    if (branches.length) {
      setPending(item);
      setChooser(null);
      return;
    }
    onPick(item, event, target);
    close();
  };

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
          if (open) close();
          else setOpen(true);
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
          {pending ? (
            <>
              <div className="continue-menu-title">{`${pending.title} into branch`}</div>
              {branches.map((branch) => (
                <button
                  key={branch.branchId ?? branch.onFlow}
                  type="button"
                  title={`Insert into ${branch.label}`}
                  onClick={(event) => {
                    onPick(pending, event, { ...target, ...branch });
                    close();
                  }}
                >
                  {branch.label}
                </button>
              ))}
              <button type="button" className="continue-menu-back" onClick={() => setPending(null)}>
                Back
              </button>
            </>
          ) : (
            <>
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
                              onClick={(event) => take(entry.item, event)}
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
                      take(resolved.item, event);
                    }}
                  >
                    {action.label}
                  </button>
                );
              })}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
