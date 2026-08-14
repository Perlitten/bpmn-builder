import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { xmlToProcess } from '@bpmn/bpmn-adapter';
import { PreservedBpmnFields } from './PreservedBpmnFields';
import type { DiagramElement } from '../diagramElement';

const STRESS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../../../../packages/bpmn-adapter/fixtures/insurance-claim-stress.bpmn'),
  'utf8',
);

function el(id: string, type: string, extra: DiagramElement['businessObject'] = {}): DiagramElement {
  return { id, type, businessObject: { $type: type, ...extra } };
}

describe('PreservedBpmnFields', () => {
  it('renders BPMN-native labels for values the graph already stores', async () => {
    const process = await xmlToProcess(STRESS);
    const html = renderToStaticMarkup(
      createElement(PreservedBpmnFields, {
        process,
        element: el('Task_Policy', 'bpmn:ServiceTask', { name: 'Fetch policy data' }),
        onChange: vi.fn(),
      }),
    );
    expect(html).toContain('aria-label="Documentation"');
    expect(html).toContain('Load the policy from the core system.');
    expect(html).toContain('aria-label="Topic"');
    expect(html).toContain('claim-intake');
    expect(html).toContain('aria-label="Executable"');
    expect(html).toContain('aria-label="Process documentation"');
    expect(html).toContain('Claims handling process.');
    expect(html).not.toContain('aria-label="Assignee"');
  });

  it('renders timer duration, script, decision ref, and multi-instance', async () => {
    const process = await xmlToProcess(STRESS);
    const timer = renderToStaticMarkup(
      createElement(PreservedBpmnFields, { process, element: el('Catch_Timer', 'bpmn:IntermediateCatchEvent'), onChange: vi.fn() }),
    );
    expect(timer).toContain('aria-label="Timer duration"');
    expect(timer).toContain('P5D');

    const script = renderToStaticMarkup(
      createElement(PreservedBpmnFields, { process, element: el('Task_Calc', 'bpmn:ScriptTask'), onChange: vi.fn() }),
    );
    expect(script).toContain('aria-label="Script"');
    expect(script).toContain('print(&#x27;payout&#x27;)');

    const dmn = renderToStaticMarkup(
      createElement(PreservedBpmnFields, { process, element: el('Task_Fraud', 'bpmn:BusinessRuleTask'), onChange: vi.fn() }),
    );
    expect(dmn).toContain('aria-label="Decision ref"');
    expect(dmn).toContain('risk-table');

    const mi = renderToStaticMarkup(
      createElement(PreservedBpmnFields, { process, element: el('Task_MI', 'bpmn:Task'), onChange: vi.fn() }),
    );
    expect(mi).toContain('aria-label="Sequential multi-instance"');
    expect(mi).toContain('aria-label="Multi-instance cardinality"');
    expect(mi).toContain('value="3"');
  });
});
