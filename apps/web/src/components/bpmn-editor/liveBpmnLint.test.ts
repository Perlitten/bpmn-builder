import { DEFAULT_EXECUTION_PROFILE, lintProcess } from '@bpmn/rules';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BPMN_XML } from './defaultBpmnXml';
import { lintLiveBpmnXml } from './liveBpmnLint';

describe('lintLiveBpmnXml', () => {
  it('runs the product execution profile against the supplied live XML', () => {
    const localXml = DEFAULT_BPMN_XML.replace('Starter task', 'Latest local task');
    expect(lintLiveBpmnXml(localXml)).toEqual(
      lintProcess(localXml, { executionProfile: DEFAULT_EXECUTION_PROFILE }),
    );
  });
});
