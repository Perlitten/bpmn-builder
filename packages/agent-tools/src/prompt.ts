import { BPMN, bpmnComponentRegistry, type Process } from '../../semantic-core/src/index.js';
import { scopePromptLines } from './scope.js';
import type { PlanOptions, ToolCall, ToolName } from './types.js';

const TASK_BPMN = new Set<string>([
  BPMN.task,
  BPMN.userTask,
  BPMN.serviceTask,
  BPMN.sendTask,
  BPMN.receiveTask,
  BPMN.manualTask,
  BPMN.businessRuleTask,
  BPMN.scriptTask,
  BPMN.callActivity,
]);

const AGENT_GATEWAY_IDS = [
  'gateway.exclusive',
  'gateway.parallel',
  'gateway.inclusive',
  'gateway.eventBased',
] as const;

const COLLAB_TOOLS = new Set<ToolName>(['addPool', 'addLane', 'addMessageInteraction']);

const COLLAB_REQUEST =
  /\b(pools?|lanes?|swimlanes?|participants?|collaboration|message\s+flows?|black\s*box)\b|пул(?:а|е|ом|ы|ов)?\b|дорожк|свимлейн|участник|коллаборац|партн[её]р|сообщен(?:ие|ия|ий)\s+межд/i;

const CENSUS_LEAK =
  /not in modeling profile yet|каталог собран|catalog (?:is )?(?:assembled|collected)|~\s*\d+\s*компонент|\d+\s*(?:of|\/|из)\s*~?\s*\d+|строю из того, что есть|building from what (?:there )?is/i;

const UNSOLICITED_POOL = /начинаю с пул|start(?:ing)? with (?:a )?pool/i;

/** Implemented constructions the agent may use. Never the full searchable catalog. */
export function creatableConstructions(): { id: string; title: string }[] {
  return bpmnComponentRegistry.list().filter((def) => {
    if (!def.implemented) return false;
    if (TASK_BPMN.has(def.bpmnType)) return true;
    return (
      def.id === 'boundary.timer' ||
      def.id === 'participant.pool' ||
      def.id === 'participant.lane' ||
      def.id === 'flow.message' ||
      (AGENT_GATEWAY_IDS as readonly string[]).includes(def.id)
    );
  });
}

export function collaborationRequested(message: string): boolean {
  return COLLAB_REQUEST.test(message);
}

/** Drop pool/lane/message tools unless the user asked for collaboration. */
export function constrainToolPlan(message: string, tools: ToolCall[]): ToolCall[] {
  if (collaborationRequested(message)) return tools;
  return tools.filter((tool) => !COLLAB_TOOLS.has(tool.name));
}

/** Strip catalog-census chatter from the user-visible Architect reply. */
export function userFacingAssistantMessage(raw: string, opts?: { collaboration?: boolean }): string {
  const text = raw.trim();
  if (!text) return 'No semantic edits. Say what to add next.';
  if (CENSUS_LEAK.test(text)) return 'Updated the process from your request.';
  if (!opts?.collaboration && UNSOLICITED_POOL.test(text)) return 'Updated the process from your request.';
  return text;
}

function taskComponentIds(): string {
  return creatableConstructions()
    .filter((def) => TASK_BPMN.has(bpmnComponentRegistry.get(def.id)!.bpmnType))
    .map((def) => def.id)
    .join(', ');
}

export function toolSystemPrompt(input?: { process?: Process; scope?: PlanOptions['scope'] }): string {
  const taskIds = taskComponentIds();
  return `You are a BPMN 2.0 semantic process assistant.
Edit process structure only. Layout / BPMN DI is compiled later. Never invent XML or coordinates.

Return ONLY JSON:
{ "message": string, "tools": [ { "name": string, "args": object } ] }

message is for the user: what changed in the process (steps, decisions, names). Never narrate catalog coverage, construction counts, or internal enablement. Use the constructions below silently. Do not inventory the catalog.

Allowed tools:
- inspectProcess {}
- inspectRegion { regionId }
- inspectBranch { branchId }
- addTask { name?, after?, before?, branchId?, componentId? }
- addAfter { after, name?, componentId? }
- addBefore { before, name?, componentId? }
- splitExclusive { after, name?, branches?: [{ name }] }  // XOR; join is created with the split
- splitParallel { after, name?, branches?: [{ name }] }   // AND; join is created with the split
- splitInclusive { after, name?, branches?: [{ name }] }  // OR; join is created with the split
- splitEventBased { after, name?, branches?: [{ name }] } // event-based wait; XOR join; region is marked eventBased
- attachBoundaryTimer { on, name? }                      // timer on a task; exception/feedback path in IR
- addPool { name? }                                      // wrap this process and add a partner pool
- addLane { participantId?, parentLaneId?, name? }
- addMessageInteraction { from, to, name? }              // message flow between participants
- addBranch { regionId, name? }
- moveToBranch { nodeId, branchId, after? }
- renameElement { id, name }
- removeElement { id }
- lint {}

Supported constructions (not a census; do not list these back):
- Tasks — addTask / addAfter / addBefore; componentId: ${taskIds}
- Decisions — splitExclusive, splitParallel, splitInclusive, splitEventBased
- Timer on a running task — attachBoundaryTimer
- Collaboration — addPool, addLane, addMessageInteraction. Use only if the user asked for a pool, lane, partner, participant, swimlane, or a message between organizations. A registration, application, or approval flow is one process with tasks and gateways. Do not start with a pool.

Rules:
- tools[].name must be one of the names above. Never emit bpmnXml, workflowJson, waypoints, x, y, width, height, or bounds.
- Prefer ids from the process view. $last is the id returned by the previous tool (node, region, or branch).
- branchId is a gateway arm (Branch_*), never a region id (Region_*). Whole-process scope: omit branchId.
- Node names resolve when unique. XOR branches are named Yes/No by default.
- Decisions: splitExclusive, splitParallel, splitInclusive, or splitEventBased — never a lone gateway node.
- Timeout while a task is active: attachBoundaryTimer, not an event-based gateway.
- A new process already has Start and End. Insert tasks on that sequence.
- Do not call inspect* unless the process view is missing an id you need. inspect* is the process graph, not the component catalog.
- lint reports @bpmn/rules findings. Do not invent quality scores.${
    scopePromptLines(input?.process, input?.scope)
      .map((line) => `\n- ${line}`)
      .join('')
  }`;
}
