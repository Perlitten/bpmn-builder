import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProcessSummary } from '@bpmn/domain';
import { copyProcessName } from '@bpmn/domain';
import { DuplicateProcessDialog } from './DuplicateProcessDialog';
import { duplicateRequestFromDialog } from './duplicateRequest';

const STARTER = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start" />
    <bpmn:task id="Activity_1" name="Task" />
    <bpmn:endEvent id="EndEvent_1" name="End" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

function summary(name: string): ProcessSummary {
  return {
    id: 'p1',
    name,
    description: null,
    status: 'draft',
    bpmnXml: STARTER,
    version: 1,
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  };
}

describe('duplicateRequestFromDialog', () => {
  it('cancel does not create', () => {
    expect(duplicateRequestFromDialog({ action: 'cancel' })).toBeNull();
  });

  it('confirm with custom name creates that name', () => {
    expect(duplicateRequestFromDialog({ action: 'confirm', name: '  AP clone  ' })).toEqual({
      name: 'AP clone',
    });
  });

  it('confirm with a blank name does not create', () => {
    expect(duplicateRequestFromDialog({ action: 'confirm', name: '   ' })).toBeNull();
  });
});

describe('DuplicateProcessDialog', () => {
  it('proposes X (copy) and requires Make a copy to confirm', () => {
    const html = renderToStaticMarkup(
      createElement(DuplicateProcessDialog, {
        process: summary('Invoice review'),
        busy: false,
        error: null,
        onConfirm: () => undefined,
        onClose: () => undefined,
      }),
    );
    expect(html).toMatch(/role="dialog"/);
    expect(html).toMatch(/aria-modal="true"/);
    expect(html).toContain('Duplicate process');
    expect(html).toContain(copyProcessName('Invoice review'));
    expect(html).toContain('Make a copy');
    expect(html).toContain('Cancel');
    expect(html).not.toContain('board');
  });
});
