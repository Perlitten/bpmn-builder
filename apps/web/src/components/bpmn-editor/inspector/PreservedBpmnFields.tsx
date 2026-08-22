import { useEffect, useMemo, useRef, useState } from 'react';
import type { SemanticProcess } from '@bpmn/semantic-core';
import { TextAreaField } from '../../ui/TextAreaField';
import { TextField } from '../../ui/TextField';
import type { DiagramElement } from '../diagramElement';
import { applyInspectorNameKey, commitInspectorName } from './inspectorNameKey';
import {
  applyPreservedValue,
  preservedFieldsFor,
  type PreservedChange,
  type PreservedField,
} from './preservedFields';

const GROUP_TITLE: Record<PreservedField['group'], string> = {
  documentation: 'Documentation',
  element: 'BPMN',
  execution: 'Execution',
  multiInstance: 'Multi-instance',
  process: 'Process',
};

const GROUP_ORDER: PreservedField['group'][] = [
  'documentation',
  'element',
  'execution',
  'multiInstance',
  'process',
];

export type PreservedBpmnFieldsProps = {
  process: SemanticProcess;
  element: DiagramElement;
  onChange: (change: PreservedChange) => void;
};

function FieldInput({
  field,
  hideLabel,
  onChange,
}: {
  field: PreservedField;
  hideLabel?: boolean;
  onChange: (change: PreservedChange) => void;
}) {
  const [draft, setDraft] = useState(String(field.value));
  const committed = useRef(String(field.value));
  useEffect(() => {
    const next = String(field.value);
    setDraft(next);
    committed.current = next;
  }, [field.key, field.value]);

  const commit = (next = draft) => {
    setDraft(next);
    committed.current = commitInspectorName(next, committed.current, (value) => {
      onChange(applyPreservedValue(field, value));
    });
  };

  if (field.kind === 'checkbox') {
    return (
      <label className="element-inspector-check">
        <input
          type="checkbox"
          checked={field.value === true}
          aria-label={field.label}
          onChange={(event) => onChange(applyPreservedValue(field, event.target.checked))}
        />
        {field.label}
      </label>
    );
  }

  const shared = {
    value: draft,
    'aria-label': field.label,
    onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
    onBlur: (event: { currentTarget: { value: string } }) => commit(event.currentTarget.value),
    onKeyDown: (event: { key: string; preventDefault: () => void; stopPropagation: () => void; currentTarget: { value: string } }) => {
      const action = applyInspectorNameKey(event);
      if (action === 'commit') commit(event.currentTarget.value);
      if (action === 'revert') setDraft(committed.current);
    },
  };

  return (
    <label>
      <span className={hideLabel ? 'sr-only' : 'element-inspector-field-label'}>{field.label}</span>
      {field.kind === 'textarea' ? <TextAreaField rows={3} {...shared} /> : <TextField type="text" {...shared} />}
    </label>
  );
}

export function PreservedBpmnFields({ process, element, onChange }: PreservedBpmnFieldsProps) {
  const fields = useMemo(() => preservedFieldsFor(process, element), [process, element]);
  if (fields.length === 0) return null;
  return (
    <>
      {GROUP_ORDER.map((group) => {
        const items = fields.filter((field) => field.group === group);
        if (items.length === 0) return null;
        const hideInnerLabel = group === 'documentation';
        return (
          <div key={group}>
            <h3>{GROUP_TITLE[group]}</h3>
            {items.map((field) => (
              <FieldInput key={field.key} field={field} hideLabel={hideInnerLabel} onChange={onChange} />
            ))}
          </div>
        );
      })}
    </>
  );
}
