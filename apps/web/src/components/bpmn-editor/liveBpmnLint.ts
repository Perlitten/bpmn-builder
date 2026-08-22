import { DEFAULT_EXECUTION_PROFILE, lintProcess } from '@bpmn/rules';

export function lintLiveBpmnXml(xml: string) {
  return lintProcess(xml, { executionProfile: DEFAULT_EXECUTION_PROFILE });
}
