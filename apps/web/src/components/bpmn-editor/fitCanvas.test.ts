import { describe, expect, it } from 'vitest';
import { participantSetKey, shouldApplyFit, shouldFitCanvas } from './fitCanvas';

describe('participantSetKey', () => {
  it('ignores names so a rename is not a set change', () => {
    const before = participantSetKey({
      participants: [{ id: 'P1' }, { id: 'P2' }],
      lanes: [{ id: 'L1' }],
    });
    const afterRename = {
      participants: [
        { id: 'P1', name: 'Ops' },
        { id: 'P2', name: 'Partner' },
      ],
      lanes: [{ id: 'L1', name: 'Clerk' }],
    };
    expect(participantSetKey(afterRename)).toBe(before);
  });

  it('changes when a pool or lane id is added', () => {
    const empty = participantSetKey({ participants: [], lanes: [] });
    const pooled = participantSetKey({ participants: [{ id: 'P1' }, { id: 'P2' }], lanes: [] });
    const laned = participantSetKey({ participants: [{ id: 'P1' }, { id: 'P2' }], lanes: [{ id: 'L1' }] });
    expect(pooled).not.toBe(empty);
    expect(laned).not.toBe(pooled);
  });
});

describe('shouldFitCanvas', () => {
  it('runs on first import and when the pool/lane set changes', () => {
    expect(shouldFitCanvas(undefined, '|')).toBe(true);
    expect(shouldFitCanvas('|', 'P1,P2|')).toBe(true);
    expect(shouldFitCanvas('P1,P2|', 'P1,P2|L1')).toBe(true);
  });

  it('skips when the id set is unchanged (task, rename, assignLane)', () => {
    expect(shouldFitCanvas('|', '|')).toBe(false);
    expect(shouldFitCanvas('P1,P2|L1', 'P1,P2|L1')).toBe(false);
  });
});

describe('shouldApplyFit', () => {
  it('fits until the first successful paint, then only on a set change', () => {
    expect(shouldApplyFit(false, false)).toBe(true);
    expect(shouldApplyFit(false, true)).toBe(true);
    expect(shouldApplyFit(true, true)).toBe(true);
    expect(shouldApplyFit(true, false)).toBe(false);
  });
});
