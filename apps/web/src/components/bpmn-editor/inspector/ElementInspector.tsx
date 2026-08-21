import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { allFindings, suggestName, type LintResult } from '@bpmn/rules';
import { bpmnComponentRegistry, findFlowNode, type BpmnComponentDefinition, type Process } from '@bpmn/semantic-core';
import { ScoreChips } from '../../lint/ScoreChips';
import { SelectField } from '../../ui/SelectField';
import { TextField } from '../../ui/TextField';
import { isActivity } from '../palette/contextFilter';
import { iconClassFor } from '../palette/catalogPresentation';
import type { DiagramElement } from '../diagramElement';
import { createInspectorCreateGate } from './inspectorCreateGesture';
import {
  attachActions,
  changeToOptions,
  currentComponentId,
  elementName,
  flowKind,
  type FlowKind,
  isLaneElement,
  isParticipant,
  isXorOr,
  outgoingFlowRows,
  poolLaneCreate,
  type PoolLaneRow,
} from './inspectorModel';
import { applyInspectorNameKey, commitInspectorName } from './inspectorNameKey';
import { nameContextFromElement } from './nameContext';
import { PreservedBpmnFields } from './PreservedBpmnFields';
import type { PreservedChange } from './preservedFields';
import './inspector.css';

type ElementInspectorProps = {
  element: DiagramElement;
  canDelete: boolean;
  lint: LintResult;
  framed?: boolean;
  replaceWorks: (def: BpmnComponentDefinition) => boolean;
  onRename: (name: string) => void;
  onRenameLane?: (laneId: string, name: string) => void;
  onChangeTo: (def: BpmnComponentDefinition) => void;
  onDelete: () => void;
  onFlowKind: (kind: FlowKind) => void;
  onCondition: (flowId: string, body: string) => void;
  onDefaultOutgoing: (flowId: string) => void;
  onCalledElement?: (calledElement: string) => void;
  onAttach: (def: BpmnComponentDefinition) => void;
  onCreate: (def: BpmnComponentDefinition) => void;
  process?: Process;
  onPreservedChange?: (change: PreservedChange) => void;
  poolLanes?: PoolLaneRow[];
  nodeLanes?: PoolLaneRow[];
  currentLaneId?: string;
  onAssignLane?: (laneId: string) => void;
};

function LaneNameField({
  laneId,
  name: initial,
  onRename,
}: {
  laneId: string;
  name: string;
  onRename?: (laneId: string, name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const committed = useRef(initial);
  useEffect(() => {
    setName(initial);
    committed.current = initial;
  }, [laneId, initial]);
  const commit = (next = name) => {
    setName(next);
    committed.current = commitInspectorName(next, committed.current, (value) => onRename?.(laneId, value));
  };
  return (
    <label>
      <span className="sr-only">Lane name</span>
      <TextField
        type="text"
        value={name}
        aria-label="Lane name"
        onChange={(event) => setName(event.target.value)}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          const action = applyInspectorNameKey(event);
          if (action === 'commit') commit(event.currentTarget.value);
          if (action === 'revert') setName(committed.current);
        }}
      />
    </label>
  );
}

export function ElementInspector({
  element,
  canDelete,
  lint,
  framed = true,
  replaceWorks,
  onRename,
  onRenameLane,
  onChangeTo,
  onDelete,
  onFlowKind,
  onCondition,
  onDefaultOutgoing,
  onCalledElement,
  onAttach,
  onCreate,
  process,
  onPreservedChange,
  poolLanes = [],
  nodeLanes = [],
  currentLaneId,
  onAssignLane,
}: ElementInspectorProps) {
  const registry = bpmnComponentRegistry;
  const [query, setQuery] = useState('');
  const [name, setName] = useState(elementName(element));
  const committedName = useRef(elementName(element));
  const addLaneGate = useRef(createInspectorCreateGate());
  const currentId = currentComponentId(registry, element);
  const current = currentId ? registry.get(currentId) : undefined;
  const options = useMemo(
    () => changeToOptions(registry, element, query, replaceWorks),
    [element, query, replaceWorks, registry],
  );
  const attach = isActivity(element) ? attachActions(registry, element) : [];
  const poolLane = poolLaneCreate(registry, element);
  const showReplace = !isParticipant(element) && !isLaneElement(element);
  const isFlow = element.type === 'bpmn:SequenceFlow';
  const kind = isFlow ? flowKind(element) : null;
  const outgoing = isXorOr(element.type) ? outgoingFlowRows(element) : [];
  const suggestion = useMemo(() => {
    const focused = lint.style.filter((finding) => finding.elementId === element.id);
    return suggestName(nameContextFromElement(element), focused);
  }, [element, lint.style]);

  useEffect(() => {
    setQuery('');
    const next = elementName(element);
    setName(next);
    committedName.current = next;
    addLaneGate.current.reset();
  }, [element.id]);

  useEffect(() => {
    const next = elementName(element);
    setName(next);
    committedName.current = next;
  }, [element.id, element.businessObject?.name, element.businessObject?.text]);

  const commitName = (next = name) => {
    setName(next);
    committedName.current = commitInspectorName(next, committedName.current, onRename);
  };

  const root = (children: ReactNode) =>
    framed ? (
      <aside className="element-inspector" aria-label="Element inspector">
        {children}
      </aside>
    ) : (
      <div className="element-inspector-main">{children}</div>
    );

  return root(
    <>
      <div className="element-inspector-head">
        <h2>{current?.title ?? element.type.replace(/^bpmn:/, '')}</h2>
        <span className="element-inspector-type">{element.type}</span>
      </div>
      <div className="element-inspector-body">
        <h3>Name</h3>
        <label>
          <span className="sr-only">Element name</span>
          <TextField
            type="text"
            value={name}
            aria-label="Element name"
            onChange={(event) => setName(event.target.value)}
            onBlur={(event) => commitName(event.currentTarget.value)}
            onKeyDown={(event) => {
              const action = applyInspectorNameKey(event);
              if (action === 'commit') commitName(event.currentTarget.value);
              if (action === 'revert') setName(committedName.current);
            }}
          />
        </label>
        {suggestion ? (
          <>
            <button
              type="button"
              className="element-inspector-suggest"
              onClick={() => {
                setName(suggestion.name);
                committedName.current = commitInspectorName(suggestion.name, committedName.current, onRename);
              }}
            >
              Suggest name
            </button>
            <p className="element-inspector-hint">
              {suggestion.name ? suggestion.name : 'Leave unlabeled'} — {suggestion.reason}
            </p>
          </>
        ) : null}

        {process && onPreservedChange ? (
          <PreservedBpmnFields process={process} element={element} onChange={onPreservedChange} />
        ) : null}

        {nodeLanes.length > 0 ? (
          <>
            <h3>Lane</h3>
            <label>
              <span className="sr-only">Lane</span>
              <SelectField
                aria-label="Lane"
                value={currentLaneId ?? ''}
                onChange={(event) => {
                  const laneId = event.target.value;
                  if (laneId) onAssignLane?.(laneId);
                }}
              >
                {!currentLaneId ? <option value="">Not in a lane</option> : null}
                {nodeLanes.map((lane) => (
                  <option key={lane.id} value={lane.id}>
                    {lane.name.trim() ? lane.name : lane.id}
                  </option>
                ))}
              </SelectField>
            </label>
          </>
        ) : null}

        {poolLane ? (
          <>
            <h3>Lanes</h3>
            {poolLanes.length === 0 ? (
              <p className="element-inspector-empty">No lanes yet</p>
            ) : (
              <ul className="element-inspector-lanes">
                {poolLanes.map((lane) => (
                  <li key={lane.id}>
                    <LaneNameField laneId={lane.id} name={lane.name} onRename={onRenameLane} />
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="element-inspector-action"
              disabled={!poolLane.enabled}
              title={poolLane.reason ?? 'Add a swimlane in this pool'}
              aria-label="Add lane to this pool"
              onPointerDown={(event) => {
                if (!addLaneGate.current.pointerDown(event.button)) return;
                event.stopPropagation();
                onCreate(poolLane.def);
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!addLaneGate.current.click(event.detail)) return;
                onCreate(poolLane.def);
              }}
            >
              Add lane
            </button>
          </>
        ) : null}

        {showReplace && (options.length > 0 || query.trim()) ? (
          <>
            <h3>Change to</h3>
            <label>
              <span className="sr-only">Search replacements</span>
              <TextField
                type="search"
                value={query}
                placeholder="Search replacements…"
                aria-label="Search replacements"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {options.length === 0 ? (
              <p className="element-inspector-empty">No matching replacements.</p>
            ) : (
              <ul className="element-inspector-list">
                {options.map((entry) => (
                  <li key={entry.def.id}>
                    <button
                      type="button"
                      className={entry.enabled ? 'palette-item' : 'palette-item is-disabled'}
                      disabled={!entry.enabled}
                      title={entry.reason ?? entry.def.title}
                      onClick={() => onChangeTo(entry.def)}
                    >
                      <span className={`palette-item-icon ${iconClassFor(entry.def)}`} aria-hidden />
                      <span className="palette-item-copy">
                        <span className="palette-item-label">{entry.def.title}</span>
                        {entry.reason ? <span className="palette-item-reason">{entry.reason}</span> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {element.type === 'bpmn:CallActivity' ? (
          <>
            <h3>Called element</h3>
            <label>
              <span className="sr-only">Called element</span>
              <TextField
                type="text"
                defaultValue={
                  process
                    ? (findFlowNode(process, element.id)?.calledElement ?? '')
                    : String(element.businessObject?.calledElement ?? '')
                }
                key={`${element.id}:${process ? findFlowNode(process, element.id)?.calledElement ?? '' : String(element.businessObject?.calledElement ?? '')}`}
                placeholder="Process id"
                aria-label="Called element"
                onBlur={(event) => onCalledElement?.(event.target.value)}
              />
            </label>
          </>
        ) : null}

        {isFlow ? (
          <>
            <h3>Flow</h3>
            <div className="element-inspector-kinds" role="group" aria-label="Sequence flow kind">
              {(['sequence', 'conditional', 'default'] as const).map((next) => {
                const def = registry.get(`flow.${next}`);
                const enabled = kind === next || (def ? replaceWorks(def) : next === 'sequence');
                return (
                  <button
                    key={next}
                    type="button"
                    className={kind === next ? 'is-active' : undefined}
                    aria-pressed={kind === next}
                    disabled={!enabled}
                    onClick={() => onFlowKind(next)}
                  >
                    {next === 'sequence' ? 'Sequence' : next === 'conditional' ? 'Conditional' : 'Default'}
                  </button>
                );
              })}
            </div>
            {kind !== 'default' && element.source && (isXorOr(element.source.type) || kind === 'conditional') ? (
              <label>
                <span className="sr-only">Condition</span>
                <TextField
                  type="text"
                  defaultValue={element.businessObject?.conditionExpression?.body ?? ''}
                  key={`${element.id}:${element.businessObject?.conditionExpression?.body ?? ''}`}
                  placeholder="Condition expression"
                  aria-label="Condition expression"
                  onBlur={(event) => onCondition(element.id, event.target.value)}
                />
              </label>
            ) : null}
          </>
        ) : null}

        {outgoing.length > 0 ? (
          <>
            <h3>Outgoing</h3>
            {outgoing.map((flow) => (
              <div key={flow.id} className="element-inspector-flow">
                <span className="element-inspector-flow-name">{flow.label}</span>
                {flow.target ? (
                  <span className="element-inspector-flow-target">to {flow.target}</span>
                ) : null}
                <label>
                  <input
                    type="radio"
                    name={`default-${element.id}`}
                    checked={flow.isDefault}
                    onChange={() => onDefaultOutgoing(flow.id)}
                  />{' '}
                  Default
                </label>
                <TextField
                  type="text"
                  defaultValue={flow.condition}
                  key={`${flow.id}:${flow.condition}`}
                  placeholder="Condition"
                  aria-label={`Condition for ${flow.label}`}
                  disabled={flow.isDefault}
                  onBlur={(event) => onCondition(flow.id, event.target.value)}
                />
              </div>
            ))}
          </>
        ) : null}

        {attach.length > 0 ? (
          <>
            <h3>Attach</h3>
            {attach.map((entry) => (
              <button
                key={entry.def.id}
                type="button"
                className="element-inspector-attach"
                disabled={!entry.enabled}
                title={entry.reason ?? entry.def.title}
                onClick={() => onAttach(entry.def)}
              >
                {entry.def.title}
              </button>
            ))}
          </>
        ) : null}

        <h3>Delete</h3>
        <button
          type="button"
          className="element-inspector-delete"
          disabled={!canDelete}
          onClick={onDelete}
        >
          Delete
        </button>
        <p className="element-inspector-hint">Backspace</p>
      </div>
      <InspectorLintFooter lint={lint} elementId={element.id} />
    </>
  );
}

export function InspectorLintFooter({ lint, elementId }: { lint: LintResult; elementId?: string }) {
  const findings = allFindings(lint);
  const focused = elementId ? findings.filter((f) => f.elementId === elementId) : [];
  const rest = elementId ? findings.filter((f) => f.elementId !== elementId) : findings;
  const shown = [...focused, ...rest].slice(0, 4);
  const incompleteChecks = lint.layout === 'none' || lint.executionProfile === 'none';
  return (
    <footer className="element-inspector-footer">
      <p>
        <ScoreChips lint={lint} />
      </p>
      {shown.length === 0 ? (
        <p className="element-inspector-hint">
          {incompleteChecks ? 'Some checks were not run' : 'No rule findings'}
        </p>
      ) : (
        <ul>
          {shown.map((finding, index) => (
            <li key={`${index}:${finding.id}:${finding.elementId ?? ''}`}>{finding.message}</li>
          ))}
        </ul>
      )}
    </footer>
  );
}
