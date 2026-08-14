import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BPMN_FILE_ACCEPT } from '../../lib/readBpmnFile';
import { ImportBpmnButton } from './ImportBpmnButton';

describe('ImportBpmnButton', () => {
  it('filters the picker to BPMN/XML but still reads any selected file', () => {
    const html = renderToStaticMarkup(
      createElement(ImportBpmnButton, { onImport: () => undefined, onError: () => undefined }),
    );
    expect(html).toContain(`accept="${BPMN_FILE_ACCEPT}"`);
    expect(BPMN_FILE_ACCEPT).toBe('.bpmn,.xml,application/xml,text/xml');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('hidden=""');
  });
});
