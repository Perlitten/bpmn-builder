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

const AGENT_SKIP_CREATE = new Set(['start.none', 'end.none', 'flow.sequence']);
const COLLAB_COMPONENT_IDS = new Set(['participant.pool', 'participant.lane', 'flow.message']);
const COLLAB_TOOLS = new Set<ToolName>(['addPool', 'addLane', 'addMessageInteraction']);

const COLLAB_REQUEST =
  /\b(pools?|lanes?|swimlanes?|participants?|collaboration|message\s+flows?|black\s*box)\b|пул(?:а|е|ом|ы|ов)?\b|дорожк|свимлейн|участник|коллаборац|партн[её]р|сообщен(?:ие|ия|ий)\s+межд/i;

/** Implemented constructions the agent may use. Never the full searchable catalog. */
export function creatableConstructions(): { id: string; title: string }[] {
  return bpmnComponentRegistry.list().flatMap((def) => {
    if (!def.implemented || AGENT_SKIP_CREATE.has(def.id)) return [];
    return [{ id: def.id, title: def.title }];
  });
}

export function collaborationRequested(message: string): boolean {
  return COLLAB_REQUEST.test(message);
}

function isCollabTool(tool: ToolCall): boolean {
  if (COLLAB_TOOLS.has(tool.name)) return true;
  if (tool.name !== 'createComponent') return false;
  const id = tool.args.componentId;
  return typeof id === 'string' && COLLAB_COMPONENT_IDS.has(id);
}

/** Drop pool/lane/message tools unless the user asked for collaboration. */
export function constrainToolPlan(message: string, tools: ToolCall[]): ToolCall[] {
  if (collaborationRequested(message)) return tools;
  return tools.filter((tool) => !isCollabTool(tool));
}

/** Strip catalog-census chatter from the user-visible Architect reply. */
export function userFacingAssistantMessage(raw: string, opts?: { collaboration?: boolean }): string {
  const text = raw.trim();
  if (!text) return 'No semantic edits. Say what to add next.';
  if (containsCensusLeak(text)) return 'Updated the process from your request.';
  if (!opts?.collaboration && containsUnsolicitedPool(text)) return 'Updated the process from your request.';
  return text;
}

function containsCensusLeak(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('not in modeling profile yet') ||
    lower.includes('каталог собран') ||
    lower.includes('catalog assembled') ||
    lower.includes('catalog is assembled') ||
    lower.includes('catalog collected') ||
    lower.includes('строю из того, что есть') ||
    lower.includes('building from what there is') ||
    lower.includes('building from what is') ||
    lower.includes('компонента из') ||
    lower.includes('компонент из') ||
    lower.includes('components out of') ||
    containsCatalogCountRatio(lower)
  );
}

function containsCatalogCountRatio(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) < 48 || text.charCodeAt(index) > 57) continue;
    let end = index + 1;
    while (end < text.length && text.charCodeAt(end) >= 48 && text.charCodeAt(end) <= 57) end += 1;
    let cursor = end;
    while (cursor < text.length && text[cursor] === ' ') cursor += 1;
    if (text[cursor] === '/') cursor += 1;
    else if (text.startsWith('of', cursor) || text.startsWith('из', cursor)) cursor += 2;
    else continue;
    while (cursor < text.length && text[cursor] === ' ') cursor += 1;
    if (text[cursor] === '~') cursor += 1;
    if (text.charCodeAt(cursor) >= 48 && text.charCodeAt(cursor) <= 57) return true;
  }
  return false;
}

function containsUnsolicitedPool(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('начинаю с пул') ||
    lower.includes('starting with a pool') ||
    lower.includes('starting with pool') ||
    lower.includes('start with a pool') ||
    lower.includes('start with pool')
  );
}

function taskComponentIds(): string {
  return creatableConstructions()
    .filter((row) => TASK_BPMN.has(bpmnComponentRegistry.get(row.id)?.bpmnType ?? ''))
    .map((row) => row.id)
    .join(', ');
}

function createComponentIds(): string {
  return creatableConstructions()
    .map((row) => row.id)
    .join(', ');
}

export function toolSystemPrompt(input?: { process?: Process; scope?: PlanOptions['scope'] }): string {
  const taskIds = taskComponentIds();
  const createIds = createComponentIds();
  return `You are a BPMN 2.0 semantic process assistant.
Edit process structure only. Layout / BPMN DI is compiled later. Never invent XML or coordinates.

Return ONLY JSON:
{ "message": string, "tools": [ { "name": string, "args": object } ] }

message is for the user: what changed in the process (steps, decisions, names). Never narrate catalog coverage, construction counts, or internal enablement. Use the constructions below silently. Do not inventory the catalog. The first sentence of message must describe the process edit — never a census of available vs unavailable constructions.

Recognition only: the product registry also lists many events / activities / gateways / flows / participants / data / artifacts with semanticMeaning for search and intent matching. Those meanings help you understand the request; they are not create permissions. If the user asks for a construction with no tool below, approximate with an allowed tool (or say you cannot add that construction yet) — do not invent tools, XML, or coordinates.

Allowed tools:
- inspectProcess {}
- inspectRegion { regionId }
- inspectBranch { branchId }
- addTask { name?, after?, before?, branchId?, componentId? }
- addAfter { after, name?, componentId? }
- addBefore { before, name?, componentId? }
- createComponent { componentId, after?, name?, from?, to?, calledElement?, condition? } // registry id; never a private type list
- splitExclusive { after, name?, branches?: [{ name }] }  // XOR; join is created with the split
- splitParallel { after, name?, branches?: [{ name }] }   // AND; join is created with the split
- splitInclusive { after, name?, branches?: [{ name }] }  // OR; join is created with the split
- splitEventBased { after, name?, branches?: [{ name }] } // event-based wait; XOR join; region is marked eventBased
- splitComplex { after, name?, branches?: [{ name }] }    // complex gateway split+join
- attachBoundaryTimer { on, name? }                      // timer on a task; exception/feedback path in IR
- attachBoundaryError { on, name? }                      // interrupting error boundary on an activity
- createEventSubprocess { parent?, name? }               // event subprocess in the process or a subprocess
- setFlowKind { flowId, kind, condition? }               // kind: sequence | conditional | default
- setCalledElement { id, calledElement }                 // call activity process ref
- addDataObject { name? }
- addDataStore { name? }
- addTextAnnotation { text?, name?, associateTo? }
- addGroup { name? }
- addAssociation { from?, to? }                          // text annotation to an element; not a free arrow
- addPool { name? }                                      // wrap this process and add a partner pool
- addLane { participantId?, parentLaneId?, name? }
- assignLane { nodeId, laneId }                          // put a flow node in a lane; not for boundary events
- addMessageInteraction { from, to, name? }              // message flow between participants
- addBranch { regionId, name? }
- moveToBranch { nodeId, branchId, after? }
- renameElement { id, name }
- removeElement { id }
- lint {}

Supported constructions (not a census; do not list these back):
- Tasks — addTask / addAfter / addBefore; componentId: ${taskIds}
- Registry creates — createComponent; componentId: ${createIds}
- Decisions — splitExclusive, splitParallel, splitInclusive, splitEventBased, splitComplex
- Boundary timer / error — attachBoundaryTimer, attachBoundaryError
- Event subprocess — createEventSubprocess
- Sequence flow kind — setFlowKind (not a Visio arrow)
- Call activity — setCalledElement
- Data / artifacts — addDataObject, addDataStore, addTextAnnotation, addGroup, addAssociation
- Collaboration — addPool, addLane, assignLane, addMessageInteraction. Use addPool / addLane / addMessageInteraction only if the user asked for a pool, lane, partner, participant, swimlane, or a message between organizations. assignLane moves an existing flow node into a lane (same op as the inspector). Boundary events stay on their host. A registration, application, or approval flow is one process with tasks and gateways. Do not start with a pool.

Rules:
- tools[].name must be one of the names above. Never emit bpmnXml, workflowJson, waypoints, x, y, width, height, or bounds.
- Prefer ids from the process view. $last is the id returned by the previous tool (node, region, or branch).
- branchId is a gateway arm (Branch_*), never a region id (Region_*). Whole-process scope: omit branchId. If you pass after: Region_1 it means after the join.
- Node names resolve when unique. XOR branches are named Yes/No by default.
- Decisions: splitExclusive, splitParallel, splitInclusive, splitEventBased, or splitComplex — never a lone gateway node.
- Timeout while a task is active: attachBoundaryTimer. Failure on a task: attachBoundaryError. Not an event-based gateway.
- A new process already has Start and End. Insert tasks on that sequence. start.message / start.timer change the existing start.
- Do not call inspect* unless the process view is missing an id you need. inspect* is the process graph, not the component catalog.
- Task names must be in verb-object form starting with an action verb (e.g. 'Submit request', 'Check data', NOT 'Customer submits a request').
- lint reports @bpmn/rules findings. Do not invent quality scores.${
    scopePromptLines(input?.process, input?.scope)
      .map((line) => `\n- ${line}`)
      .join('')
  }`;
}
