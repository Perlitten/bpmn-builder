import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BpmnCanvas, diagramOptionId } from './BpmnCanvas';

describe('accessible BPMN canvas', () => {
  it('owns a selected option for every rendered shape', () => {
    const html = renderToStaticMarkup(createElement(BpmnCanvas, {
      keyboardRef: { current: null },
      items: [
        { id: 'Start_1', name: 'Start', type: 'start event' },
        { id: 'Task/1', name: 'Review invoice', type: 'user task' },
      ],
      selectedIds: ['Task/1'],
    }));
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-multiselectable="true"');
    expect(html).toContain(`aria-activedescendant="${diagramOptionId('Task/1')}"`);
    expect(html).toContain('role="option"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('Review invoice, user task, 2 of 2');
  });
});
