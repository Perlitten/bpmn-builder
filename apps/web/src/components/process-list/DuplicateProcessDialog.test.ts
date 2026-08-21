import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProcessSummary } from '@bpmn/domain';
import { copyProcessName } from '@bpmn/domain';
import { DuplicateProcessDialog } from './DuplicateProcessDialog';
import { duplicateRequestFromDialog } from './duplicateRequest';

function summary(name: string): ProcessSummary {
  return {
    id: 'p1',
    name,
    description: null,
    status: 'draft',
    version: 1,
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
    structure: 'Starter · 1 task · 1 end',
    quality: { errors: 0, warnings: 0, style: 1 },
    preview: { caption: 'Start → Task → End', nodes: [], edges: [] },
  };
}

describe('duplicateRequestFromDialog', () => {
  it('cancel does not create', () => {
    expect(duplicateRequestFromDialog({ action: 'cancel' })).toBeNull();
  });

  it('confirm with custom name creates that name', () => {
    expect(duplicateRequestFromDialog({ action: 'confirm', name: '  AP clone  ' })).toEqual({
      name: 'AP clone',
    });
  });

  it('confirm with a blank name does not create', () => {
    expect(duplicateRequestFromDialog({ action: 'confirm', name: '   ' })).toBeNull();
  });
});

describe('DuplicateProcessDialog', () => {
  it('proposes X (copy) and requires Make a copy to confirm', () => {
    const html = renderToStaticMarkup(
      createElement(DuplicateProcessDialog, {
        process: summary('Invoice review'),
        busy: false,
        error: null,
        onConfirm: () => undefined,
        onClose: () => undefined,
      }),
    );
    expect(html).toMatch(/role="dialog"/);
    expect(html).toMatch(/aria-modal="true"/);
    expect(html).toContain('Duplicate process');
    expect(html).toContain(copyProcessName('Invoice review'));
    expect(html).toContain('Make a copy');
    expect(html).toContain('Cancel');
    expect(html).not.toContain('board');
  });
});
