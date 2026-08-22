import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { bpmnComponentRegistry } from '@bpmn/semantic-core';
import { CatalogFlyout } from './CatalogFlyout';
import { catalogEnterTarget, enabledCatalogItems, flattenCatalogItems, stepCatalogHighlight } from './catalogEnter';
import { catalogForFlyout, type ResolvedCatalogItem } from './contextFilter';

function item(id: string, enabled: boolean): ResolvedCatalogItem {
  const def = bpmnComponentRegistry.get(id);
  if (!def) throw new Error(id);
  return { item: def, enabled, hidden: false, reason: enabled ? undefined : 'Not in modeling profile yet' };
}

describe('catalog Enter', () => {
  it('creates the highlighted enabled row', () => {
    const items = [item('activity.task', true), item('activity.userTask', true), item('activity.transaction', false)];
    expect(catalogEnterTarget(items, 'activity.userTask')?.item.id).toBe('activity.userTask');
  });

  it('creates the only enabled match when nothing is highlighted', () => {
    const items = [item('activity.transaction', false), item('activity.task', true)];
    expect(catalogEnterTarget(items, null)?.item.id).toBe('activity.task');
  });

  it('does not create unimplemented or disabled rows', () => {
    const items = [item('activity.transaction', false), item('activity.callActivity', false)];
    expect(catalogEnterTarget(items, 'activity.transaction')).toBeNull();
    expect(catalogEnterTarget(items, null)).toBeNull();
  });

  it('does not create when several enabled rows exist and none is highlighted', () => {
    const items = [item('activity.task', true), item('activity.userTask', true)];
    expect(catalogEnterTarget(items, null)).toBeNull();
  });

  it('moves highlight only among enabled rows', () => {
    const enabled = [item('activity.task', true), item('activity.userTask', true)];
    expect(stepCatalogHighlight(enabled, 'activity.task', 1)).toBe('activity.userTask');
    expect(stepCatalogHighlight(enabled, 'activity.userTask', 1)).toBe('activity.task');
  });

  it('treats a unique enabled search hit as the Enter target', () => {
    const { groups } = catalogForFlyout('activities', 'user task', {
      selection: { id: 'Start_1', type: 'bpmn:StartEvent' },
      hasParticipant: false,
    });
    const items = flattenCatalogItems(groups);
    const enabled = enabledCatalogItems(items);
    expect(enabled.some((entry) => entry.item.id === 'activity.userTask')).toBe(true);
    const target = catalogEnterTarget(items, enabled.length === 1 ? enabled[0]!.item.id : 'activity.userTask');
    expect(target?.enabled).toBe(true);
    expect(target?.item.id).not.toBe('activity.transaction');
  });
});

describe('catalog Enter markup', () => {
  it('wires search Enter in the flyout', () => {
    const src = readFileSync(new URL('./CatalogFlyout.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/event\.key === 'Enter'/);
    expect(src).toMatch(/catalogEnterTarget/);
    const html = renderToStaticMarkup(
      createElement(CatalogFlyout, {
        view: 'activities',
        query: 'task',
        selection: { id: 'Start_1', type: 'bpmn:StartEvent' },
        hasParticipant: false,
        onQueryChange: () => undefined,
        onViewChange: () => undefined,
        onPick: () => undefined,
        onClose: () => undefined,
      }),
    );
    expect(html).not.toMatch(/aria-modal="true"/);
    expect(html).toMatch(/role="dialog"/);
  });
});
