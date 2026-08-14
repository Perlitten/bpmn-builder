import { describe, expect, it } from 'vitest';
import { BLOCKED_EDITOR_ACTIONS, keepDiLabelBounds, semanticGeometryModule } from './semanticGeometry';

type Payload = { action?: string; context?: { shape?: { type?: string }; shapes?: Array<{ type?: string }> } };
type EventBus = {
  on: (event: string | string[], priority: number, cb: (payload: Payload) => unknown) => void;
};

describe('semanticGeometry', () => {
  it('blocks space, lasso, and global connect editor actions', () => {
    expect([...BLOCKED_EDITOR_ACTIONS].sort()).toEqual([
      'copy',
      'cut',
      'duplicate',
      'globalConnectTool',
      'lassoTool',
      'paste',
      'spaceTool',
    ]);

    const listeners = new Map<string, (payload: Payload) => unknown>();
    const install = semanticGeometryModule.semanticGeometryRules[1] as unknown as (eventBus: EventBus) => void;
    install({
      on(event, _priority, cb) {
        if (typeof event === 'string') listeners.set(event, cb);
      },
    });

    const allowed = listeners.get('editorActions.allowed')!;
    expect(allowed({ action: 'spaceTool' })).toBe(false);
    expect(allowed({ action: 'lassoTool' })).toBe(false);
    expect(allowed({ action: 'globalConnectTool' })).toBe(false);
    expect(allowed({ action: 'copy' })).toBe(false);
    expect(allowed({ action: 'paste' })).toBe(false);
    expect(allowed({ action: 'handTool' })).toBeUndefined();

    expect(listeners.get('commandStack.connection.create.canExecute')!({})).toBe(false);
  });

  it('keeps exported DI label size instead of shrinking to glyph bounds', () => {
    expect(
      keepDiLabelBounds(
        { x: 55, y: 216, width: 90, height: 24 },
        { x: 88, y: 216, width: 24, height: 14 },
      ),
    ).toEqual({ x: 55, y: 216, width: 90, height: 24 });
    expect(semanticGeometryModule.__init__).toEqual(['semanticGeometryRules', 'keepDiLabelSize']);
  });
});
