import {
  isReadOnlyTool,
  isSemanticProcess,
  parseToolPlan,
  semanticDiff,
  type AgentScope,
  type ToolCall,
} from '@bpmn/agent-tools';
import type { SemanticProcess } from '@bpmn/semantic-core';

export type AssistantPayload = {
  message: string;
  tools?: unknown;
  results?: Array<{ name: string; id: string }>;
  process?: unknown;
  previousProcess?: unknown;
  bpmnXml?: unknown;
};

export type AssistantApplySession = {
  process: () => SemanticProcess;
  xml: () => string;
  applyPlan: (tools: ToolCall[], scope?: AgentScope) => Promise<string>;
  applyProcess: (next: SemanticProcess, selectId?: string) => Promise<string>;
};

export type AssistantApplyResult = {
  xml: string;
  diff: string[];
  message: string;
  applied: boolean;
};

function mutating(tools: ToolCall[]): boolean {
  return tools.some((tool) => !isReadOnlyTool(tool.name));
}

function lastMutatingId(results: Array<{ name: string; id: string }> | undefined): string | undefined {
  if (!results) return undefined;
  for (let i = results.length - 1; i >= 0; i--) {
    const step = results[i]!;
    if (!isReadOnlyTool(step.name)) return step.id;
  }
}

/** Apply assistant tools/graph through session layout. Never adoptXml / replaceXml. */
export async function applyAssistantResult(
  session: AssistantApplySession,
  data: AssistantPayload,
  scope?: AgentScope,
): Promise<AssistantApplyResult> {
  const tools = parseToolPlan(data.tools ?? []);
  const message = typeof data.message === 'string' ? data.message.trim() : '';
  const before = session.process();

  if (!mutating(tools)) {
    return { xml: session.xml(), diff: [], message, applied: false };
  }

  const selectId = lastMutatingId(data.results);
  const xml = isSemanticProcess(data.process)
    ? await session.applyProcess(data.process, selectId)
    : await session.applyPlan(tools, scope);

  return {
    xml,
    diff: semanticDiff(before, session.process()),
    message,
    applied: true,
  };
}
