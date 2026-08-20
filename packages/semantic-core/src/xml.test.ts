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

  it('leaves unterminated comments and CDATA safe', () => {
    const elements = collectXmlElements('<!-- <a id="fake"></a>', 'a');
    expect(elements).toHaveLength(0);
    const elements2 = collectXmlElements('<![CDATA[ <a id="fake"></a>', 'a');
    expect(elements2).toHaveLength(0);
  });

  it('decodes numeric character references properly and single pass', () => {
    const attrs = parseXmlAttributes('name="Review &#38; Approve" id="Task&#95;1" hex="&#x26;" nested="&amp;#38;" escape="&amp;lt;"');
    expect(attrs.get('name')).toBe('Review & Approve');
    expect(attrs.get('id')).toBe('Task_1');
    expect(attrs.get('hex')).toBe('&');
    expect(attrs.get('nested')).toBe('&#38;');
    expect(attrs.get('escape')).toBe('&lt;');
  });

  it('leaves invalid and out-of-range numeric entities as literal text', () => {
    const attrs = parseXmlAttributes('nul="&#0;" sur="&#xd800;" out="&#999999999;" inv="&#xZZ;"');
    expect(attrs.get('nul')).toBe('&#0;');
    expect(attrs.get('sur')).toBe('&#xd800;');
    expect(attrs.get('out')).toBe('&#999999999;');
    expect(attrs.get('inv')).toBe('&#xZZ;');
  });

  it('handles quotes and > inside attribute values', () => {
    const attrs = parseXmlAttributes('cond="val > 5" other=\'val > 6\' inner="\\"quoted\\""');
    expect(attrs.get('cond')).toBe('val > 5');
    expect(attrs.get('other')).toBe('val > 6');
  });

  it('collects nested elements of the same name correctly (outer first, contains inner)', () => {
    const elements = collectXmlElements('<a id="outer"><a id="inner">inner_text</a></a>', 'a');
    expect(elements).toHaveLength(2);
    // Elements should be ordered by start tag
    expect(elements[0].rawAttributes).toContain('outer');
    expect(elements[0].inner).toBe('<a id="inner">inner_text</a>');

    expect(elements[1].rawAttributes).toContain('inner');
    expect(elements[1].inner).toBe('inner_text');
  });
});
