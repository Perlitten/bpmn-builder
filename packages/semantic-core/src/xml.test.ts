import { describe, it, expect } from 'vitest';
import { collectXmlElements, parseXmlAttributes } from './xml.js';

describe('XML parsing edge cases', () => {
  it('skips comments without matching elements inside', () => {
    const elements = collectXmlElements('<!-- > <a id="fake"></a> --><a id="real"></a>', 'a');
    expect(elements).toHaveLength(1);
    expect(elements[0].rawAttributes).toContain('real');
  });

  it('skips CDATA sections completely', () => {
    const elements = collectXmlElements('<![CDATA[ <a id="fake"></a> ]]><a id="real"></a>', 'a');
    expect(elements).toHaveLength(1);
    expect(elements[0].rawAttributes).toContain('real');
  });

  it('decodes numeric character references', () => {
    const attrs = parseXmlAttributes('name="Review &#38; Approve" id="Task&#95;1" hex="&#x26;"');
    expect(attrs.get('name')).toBe('Review & Approve');
    expect(attrs.get('id')).toBe('Task_1');
    expect(attrs.get('hex')).toBe('&');
  });
});
