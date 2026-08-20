import { describe, expect, it } from 'vitest';
import { describeBpmnXml, describeSemanticProcess } from './describeProcess';
import { SHOWCASE_EXAMPLES } from './showcaseExamples';

function countXmlTag(xml: string, tag: string): number {
  const matches = xml.match(new RegExp(`<bpmn:${tag}\\b`, 'g'));
  return matches ? matches.length : 0;
}

describe('Showcase Examples Structural Assertions', () => {
  it.each(SHOWCASE_EXAMPLES)(
    'renders $id example with correct region count, node types, and exact task names',
    (example) => {
      const process = describeSemanticProcess(example.label, example.description);

      // Region count assertion
      expect(process.regions.length).toBe(example.regionCount);

      // Extract task names from semantic process nodes
      const taskNodes = process.nodes.filter((node) => node.type === 'task');
      const actualTaskNames = taskNodes.map((node) => node.name);
      expect(actualTaskNames).toEqual(example.taskNames);
      expect(taskNodes.length).toBe(example.taskCount);

      // XML assertions
      const xml = describeBpmnXml(example.label, example.description);
      expect(xml).toContain('<bpmn:definitions');
      expect(xml).toContain('<bpmn:process');

      expect(countXmlTag(xml, 'exclusiveGateway')).toBe(example.exclusiveGatewayCount);
      expect(countXmlTag(xml, 'parallelGateway')).toBe(example.parallelGatewayCount);
      expect(countXmlTag(xml, 'task')).toBe(example.taskCount);
    },
  );
});
