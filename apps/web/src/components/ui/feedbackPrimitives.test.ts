import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';
import { Chip } from './Chip';
import { IconButton } from './IconButton';
import { Toast } from './Toast';

describe('feedback primitives', () => {
  it('gives icon-only controls an accessible name and a contract tooltip without native title UI', () => {
    const html = renderToStaticMarkup(
      createElement(IconButton, { label: 'Zoom in', children: createElement('svg') }),
    );
    expect(html).toContain('aria-label="Zoom in"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('aria-describedby=');
    expect(html).not.toMatch(/ title=/);
  });

  it('renders one-line confirmation with an optional undo action', () => {
    const html = renderToStaticMarkup(
      createElement(Toast, {
        message: 'Undid last change',
        actionLabel: 'Redo',
        onAction: () => undefined,
        onDismiss: () => undefined,
      }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('Undid last change');
    expect(html).toMatch(/<button[^>]*>Redo<\/button>/);
  });

  it('separates value chips from count-only badges', () => {
    const chip = renderToStaticMarkup(createElement(Chip, { children: 'Quality 100' }));
    const badge = renderToStaticMarkup(createElement(Badge, { children: 3 }));
    expect(chip).toContain('ui-chip');
    expect(badge).toContain('ui-badge');
  });
});
