import { describe, expect, it } from 'vitest';
import { validateWorkflowDocument } from './validateWorkflow.js';

describe('validateWorkflowDocument', () => {
  it('rejects non-objects', () => {
    const result = validateWorkflowDocument([]);
    expect(result.ok).toBe(false);
  });

  it('accepts a linear draft graph', () => {
    const result = validateWorkflowDocument({
      nodes: [
        { id: 's', type: 'startEvent', label: 'Start' },
        { id: 't', type: 'task', label: 'Work' },
        { id: 'e', type: 'endEvent', label: 'End' },
      ],
      edges: [
        { id: 'f1', source: 's', target: 't' },
        { id: 'f2', source: 't', target: 'e' },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('requires gateway branches when publishing', () => {
    const result = validateWorkflowDocument(
      {
        nodes: [
          { id: 's', type: 'startEvent', label: 'Start' },
          { id: 'g', type: 'exclusiveGateway', label: '?' },
          { id: 'e', type: 'endEvent', label: 'End' },
        ],
        edges: [
          { id: 'f1', source: 's', target: 'g' },
          { id: 'f2', source: 'g', target: 'e' },
        ],
      },
      { mode: 'publish' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'gateway_needs_branches')).toBe(true);
    }
  });
});
