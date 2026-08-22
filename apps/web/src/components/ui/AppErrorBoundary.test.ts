// @vitest-environment jsdom

import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

function Broken(): never {
  throw new Error('render failed');
}

describe('AppErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('replaces an unhandled render crash with a recovery action', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(createElement(AppErrorBoundary, null, createElement(Broken)));

    expect(screen.getByRole('alert').textContent).toContain('The workspace could not render');
    expect(screen.getByRole('button', { name: 'Reload workspace' }).hasAttribute('disabled')).toBe(false);
  });
});
