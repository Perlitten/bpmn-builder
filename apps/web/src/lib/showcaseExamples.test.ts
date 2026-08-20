import { describe, expect, it } from 'vitest';
import { describeBpmnXml, describeSemanticProcess } from './describeProcess';
import { SHOWCASE_EXAMPLES } from './showcaseExamples';

describe('Showcase Examples', () => {
  it.each(SHOWCASE_EXAMPLES)('renders $id example with correct structure', (example) => {
    // 1. Check generated XML
    const xml = describeBpmnXml(example.label, example.description);
    expect(xml).toContain('<bpmn:definitions');
    expect(xml).toContain('<bpmn:process');

    // 2. Check structural fields
    const process = describeSemanticProcess(example.label, example.description);

    expect(process.regions.length).toBe(example.regionCount);

    const exclusiveGatewayCount = process.nodes.filter(n => n.bpmnType === 'bpmn:ExclusiveGateway').length;
    expect(exclusiveGatewayCount).toBe(example.exclusiveGatewayCount);

    const parallelGatewayCount = process.nodes.filter(n => n.bpmnType === 'bpmn:ParallelGateway').length;
    expect(parallelGatewayCount).toBe(example.parallelGatewayCount);

    const tasks = process.nodes.filter(n => n.type === 'task');
    expect(tasks.length).toBe(example.taskCount);

    const taskNames = tasks.map(t => t.name);
    // Sort names to avoid order sensitivity, since they can appear in different orders in branches
    expect(taskNames.sort()).toEqual([...example.taskNames].sort());
  });
});
