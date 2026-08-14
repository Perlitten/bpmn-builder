import { describe, expect, it } from 'vitest';
import { validateProcess, validateProcessPatch } from './validateProcess.js';

const base = {
  id: 'p1',
  name: 'Onboarding',
  status: 'draft' as const,
  bpmnXml: '<bpmn:definitions />',
};

describe('validateProcess', () => {
  it('rejects missing name', () => {
    const result = validateProcess({
      id: 'p1',
      status: 'draft',
      bpmnXml: '<xml/>',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = validateProcess({ ...base, status: 'live' as 'draft' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid status');
  });

  it('accepts a draft process', () => {
    const result = validateProcess(base);
    expect(result.ok).toBe(true);
  });

  it('accepts a template process', () => {
    const result = validateProcess({ ...base, status: 'template' });
    expect(result.ok).toBe(true);
  });

  it('rejects dangling workflow edges', () => {
    const result = validateProcess({
      ...base,
      workflowJson: {
        nodes: [{ id: 'start', type: 'startEvent', label: 'Start' }],
        edges: [{ id: 'f1', source: 'start', target: 'missing' }],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'edge_target_missing')).toBe(true);
    }
  });

  it('rejects publish without a start event', () => {
    const result = validateProcess(
      {
        ...base,
        status: 'published',
        workflowJson: { nodes: [{ id: 'end', type: 'endEvent', label: 'End' }], edges: [] },
      },
      { mode: 'publish' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'missing_start_event')).toBe(true);
    }
  });

  it('rejects empty bpmnXml', () => {
    expect(validateProcess({ ...base, bpmnXml: '' }).ok).toBe(false);
  });
});

describe('validateProcessPatch', () => {
  it('rejects empty name', () => {
    expect(validateProcessPatch({ name: '  ' }).ok).toBe(false);
  });

  it('accepts clearing description', () => {
    expect(validateProcessPatch({ description: null }).ok).toBe(true);
  });
});
