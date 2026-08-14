import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { allFindings, suggestName, type LintResult } from '@bpmn/rules';
import { bpmnComponentRegistry, type BpmnComponentDefinition } from '@bpmn/semantic-core';
import { ScoreChips } from '../../lint/ScoreChips';
import { isActivity } from '../palette/contextFilter';
import { iconClassFor } from '../palette/catalogPresentation';
import type { DiagramElement } from '../diagramElement';
import {
  attachActions,
  changeToOptions,
  currentComponentId,
  elementName,
  flowKind,
  type FlowKind,
  isDefaultOutgoing,
  isXorOr,
  outgoingSequenceFlows,
} from './inspectorModel';
import { nameContextFromElement } from './nameContext';
import './inspector.css';

type ElementInspectorProps = {
  element: DiagramElement;
  canDelete: boolean;
  lint: LintResult;
  framed?: boolean;
  replaceWorks: (def: BpmnComponentDefinition) => boolean;
  onRename: (name: string) => void;
  onChangeTo: (def: BpmnComponentDefinition) => void;
  onDelete: () => void;
  onFlowKind: (kind: FlowKind) => void;
  onCondition: (flowId: string, body: string) => void;
  onDefaultOutgoing: (flowId: string) => void;
  onAttach: (def: BpmnComponentDefinition) => void;
};

export function ElementInspector({
  element,
  canDelete,
  lint,
  framed = true,
  replaceWorks,
  onRename,
  onChangeTo,
  onDelete,
  onFlowKind,
  onCondition,
  onDefaultOutgoing,
  onAttach,
}: ElementInspectorProps) {
  const registry = bpmnComponentRegistry;
  const [query, setQuery] = useState('');
  const [name, setName] = useState(elementName(element));
  const currentId = currentComponentId(registry, element);
  const current = currentId ? registry.get(currentId) : undefined;
  const options = useMemo(
    () => changeToOptions(registry, element, query, replaceWorks),
    [element, query, replaceWorks, registry],
  );
  const attach = isActivity(element) ? attachActions(registry, element) : [];
  const isFlow = element.type === 'bpmn:SequenceFlow';
  const kind = isFlow ? flowKind(element) : null;
  const outgoing = isXorOr(element.type) ? outgoingSequenceFlows(element) : [];
  const suggestion = useMemo(() => {
    const focused = lint.style.filter((finding) => finding.elementId === element.id);
    return suggestName(nameContextFromElement(element), focused);
  }, [element, lint.style]);

  useEffect(() => {
    setQuery('');
    setName(elementName(element));
  }, [element.id]);

  useEffect(() => {
    setName(elementName(element));
  }, [element.id, element.businessObject?.name, element.businessObject?.text]);

  const commitName = () => {
    if (name !== elementName(element)) onRename(name);
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
          <input
            type="text"
            value={name}
            aria-label="Element name"
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
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
                onRename(suggestion.name);
              }}
            >
              Suggest name
            </button>
            <p className="element-inspector-hint">
              {suggestion.name ? suggestion.name : 'Leave unlabeled'} — {suggestion.reason}
            </p>
          </>
        ) : null}

        {options.length > 0 || query.trim() ? (
          <>
            <h3>Change to</h3>
            <label>
              <span className="sr-only">Search replacements</span>
              <input
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
                <input
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
            {outgoing.map((flow) => {
              const isDefault = isDefaultOutgoing(element, flow);
              const targetName = flow.target ? elementName(flow.target) || flow.target.id : flow.id;
              return (
                <div key={flow.id} className="element-inspector-flow">
                  <span className="element-inspector-flow-name">{targetName}</span>
                  <label>
                    <input
                      type="radio"
                      name={`default-${element.id}`}
                      checked={isDefault}
                      onChange={() => onDefaultOutgoing(flow.id)}
                    />{' '}
                    Default
                  </label>
                  <input
                    type="text"
                    defaultValue={flow.businessObject?.conditionExpression?.body ?? ''}
                    key={`${flow.id}:${flow.businessObject?.conditionExpression?.body ?? ''}`}
                    placeholder="Condition"
                    aria-label={`Condition for ${targetName}`}
                    disabled={isDefault}
                    onBlur={(event) => onCondition(flow.id, event.target.value)}
                  />
                </div>
              );
            })}
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
  return (
    <footer className="element-inspector-footer">
      <p>
        <ScoreChips lint={lint} />
      </p>
      {shown.length === 0 ? (
        <p className="element-inspector-hint">No rule findings</p>
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
