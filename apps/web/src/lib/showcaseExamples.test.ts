import { describe, expect, it } from 'vitest';
import { describeBpmnXml } from './describeProcess';
import { SHOWCASE_EXAMPLES } from './showcaseExamples';

function countBpmnNodes(xml: string): number {
  const matches = xml.match(/<bpmn:(startEvent|task|userTask|serviceTask|exclusiveGateway|parallelGateway|endEvent)\b/g);
  return matches ? matches.length : 0;
}

describe('Showcase Examples', () => {
  it.each(SHOWCASE_EXAMPLES)('renders $id example with $expectedNodeCount nodes', (example) => {
    const xml = describeBpmnXml(example.label, example.description);
    expect(xml).toContain('<bpmn:definitions');
    expect(xml).toContain('<bpmn:process');

    const count = countBpmnNodes(xml);
    expect(count).toBe(example.expectedNodeCount);
  });
});
