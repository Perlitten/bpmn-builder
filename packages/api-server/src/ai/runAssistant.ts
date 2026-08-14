import {
  ToolPlanError,
  collaborationRequested,
  constrainToolPlan,
  executePlan,
  isSemanticProcess,
  parseAgentScope,
  parseToolPlan,
  processView,
  scopePromptLines,
  toolSystemPrompt,
  userFacingAssistantMessage,
  type AgentScope,
  type ToolCall,
} from '../../../agent-tools/src/index.js';
import { xmlToProcess } from '../../../bpmn-adapter/src/index.js';
import { createProcess, type Process } from '../../../semantic-core/src/index.js';
import { greetingReply, isGreetingMessage } from './greeting.js';
import { assistantTimeoutError, isTimeoutError, whenAborted } from './timeout.js';
import type { AiModelClient, ChatTurn } from './types.js';

export type AssistantStep = {
  name: string;
  args: Record<string, unknown>;
  id: string;
  view?: unknown;
};

/** Semantic assistant result. Never includes BPMN XML / DI. */
export type AssistantData = {
  message: string;
  tools: ToolCall[];
  results: AssistantStep[];
  process: Process;
  previousProcess: Process;
};

const clip = (value: string, max = 24000) =>
  value.length > max ? `${value.slice(0, max)}\n…[truncated]` : value;

async function loadProcess(
  input: { process?: unknown; bpmnXml?: string; processName?: string },
  signal?: AbortSignal,
): Promise<Process> {
  if (isSemanticProcess(input.process)) return input.process;
  if (input.bpmnXml?.trim()) {
    try {
      const parsed = xmlToProcess(input.bpmnXml);
      if (!signal) return await parsed;
      const stop = whenAborted(signal);
      void stop.catch(() => undefined);
      return await Promise.race([parsed, stop]);
    } catch (error) {
      if (isTimeoutError(error)) throw error;
      throw new ToolPlanError('Could not read the posted BPMN XML. Send a semantic process graph instead.');
    }
  }
  return createProcess({ name: input.processName });
}

function llmTools(raw: Record<string, unknown>): ToolCall[] {
  if (typeof raw.bpmnXml === 'string' || raw.workflowJson != null) {
    throw new ToolPlanError('LLM must not emit BPMN XML or workflow JSON');
  }
  if (Array.isArray(raw.actions) && raw.actions.some((item) => item && typeof item === 'object' && 'bpmnXml' in item)) {
    throw new ToolPlanError('LLM must not emit replaceXml / BPMN XML');
  }
  if (Array.isArray(raw.actions) && raw.actions.length && !Array.isArray(raw.tools)) {
    throw new ToolPlanError('LLM must propose semantic tools, not editor actions');
  }
  if (!Array.isArray(raw.tools) || raw.tools.length === 0) return [];
  return parseToolPlan(raw.tools);
}

function resultsOf(tools: ToolCall[], plan: ReturnType<typeof executePlan>): AssistantStep[] {
  return plan.steps.map((step, i) => ({
    name: step.name,
    args: tools[i]?.args ?? {},
    id: step.id,
    ...(step.view !== undefined ? { view: step.view } : {}),
  }));
}

export async function runAssistant(
  ai: AiModelClient | null,
  input: {
    message?: string;
    history?: ChatTurn[];
    processName?: string;
    process?: unknown;
    bpmnXml?: string;
    tools?: unknown;
    scope?: unknown;
    signal?: AbortSignal;
  },
): Promise<AssistantData> {
  if (input.signal?.aborted) throw input.signal.reason ?? assistantTimeoutError();
  const previousProcess = await loadProcess(input, input.signal);
  const scope: AgentScope | undefined = parseAgentScope(input.scope);
  let tools: ToolCall[];
  let message = input.message?.trim() ?? '';

  if (Array.isArray(input.tools) && input.tools.length > 0) {
    tools = parseToolPlan(input.tools);
    if (!message) message = `Applied ${tools.map((t) => t.name).join(', ')}.`;
  } else if (isGreetingMessage(message)) {
    return {
      message: greetingReply(message),
      tools: [],
      results: [],
      process: previousProcess,
      previousProcess,
    };
  } else {
    if (!ai) throw new Error('AI agent is not configured.');
    const history = (input.history || [])
      .slice(-12)
      .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.text}`)
      .join('\n');
    const raw = (await ai.generateJson({
      systemInstruction: toolSystemPrompt({ process: previousProcess, scope }),
      prompt: [
        input.processName ? `Process name: ${input.processName}` : '',
        history ? `Recent chat:\n${history}` : '',
        `User request: ${message}`,
        ...scopePromptLines(previousProcess, scope),
        `Current process (semantic graph, no coordinates):\n${clip(JSON.stringify(processView(previousProcess)))}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      temperature: 0.2,
      signal: input.signal,
    })) as Record<string, unknown>;
    tools = constrainToolPlan(message, llmTools(raw));
    message = userFacingAssistantMessage(
      typeof raw.message === 'string' ? raw.message : '',
      { collaboration: collaborationRequested(message) },
    );
  }

  const plan = executePlan(previousProcess, tools, { scope });
  return {
    message,
    tools,
    results: resultsOf(tools, plan),
    process: plan.process,
    previousProcess,
  };
}
