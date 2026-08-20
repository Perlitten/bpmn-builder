import { describe, it, expect } from 'vitest';
import { collectXmlElements } from './xml.js';

describe('collectXmlElements', () => {
  it('collects nested elements', () => {
    expect(collectXmlElements('<a><b><a id="inner"></a></b></a>', 'a')).toMatchObject([
      { localName: 'a', rawAttributes: '' },
      { localName: 'a', rawAttributes: ' id="inner"' }
    ]);
  });
});
