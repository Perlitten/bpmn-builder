import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PressedToggle } from './PressedToggle';

describe('PressedToggle', () => {
  it('exposes pressed state to assistive tech and not by color alone', () => {
    const on = renderToStaticMarkup(createElement(PressedToggle, { pressed: true, children: 'All' }));
    const off = renderToStaticMarkup(createElement(PressedToggle, { pressed: false, children: 'All' }));
    expect(on).toMatch(/<button\b/);
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain('border-ink');
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain('border-transparent');
    expect(on).not.toMatch(/<button[\s\S]*<button/);
  });
});
