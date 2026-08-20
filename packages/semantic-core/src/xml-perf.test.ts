import { describe, it, expect } from 'vitest';
import { collectXmlElements } from './xml.js';

describe('collectXmlElements performance', () => {
  it('parses deeply nested documents quickly', () => {
    const NESTING_DEPTH = 2000;
    let xml = '';
    for (let i = 0; i < NESTING_DEPTH; i++) xml += '<subProcess>';
    for (let i = 0; i < NESTING_DEPTH; i++) xml += '</subProcess>';

    const start = Date.now();
    collectXmlElements(xml, 'subProcess');
    const duration = Date.now() - start;
    console.info(`Time taken: ${duration}ms`);
    expect(duration).toBeLessThan(1000);
  });
});
