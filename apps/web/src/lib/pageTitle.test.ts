import { describe, expect, it } from 'vitest';
import { pageTitle, PRODUCT_TITLE } from './pageTitle';

describe('pageTitle', () => {
  it('uses the product name on the process list', () => {
    expect(pageTitle('list')).toBe(PRODUCT_TITLE);
    expect(pageTitle('list', 'Ignored')).toBe(PRODUCT_TITLE);
  });

  it('uses the process name in the editor and updates when it changes', () => {
    expect(pageTitle('editor', 'Order fulfillment')).toBe('Order fulfillment — BPMN');
    expect(pageTitle('editor', 'Renamed')).toBe('Renamed — BPMN');
    expect(pageTitle('editor', '  ')).toBe('BPMN');
    expect(pageTitle('editor')).toBe('BPMN');
  });
});
