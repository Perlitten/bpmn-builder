import { BPMN, bpmnComponentRegistry, type SemanticProcess } from '@bpmn/semantic-core';
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

const CENSUS_PHRASES = [
  'not in modeling profile yet',
  'каталог собран',
  'catalog is assembled',
  'catalog assembled',
  'catalog is collected',
  'catalog collected',
  'строю из того, что есть',
  'building from what there is',
  'building from what is',
];
const CENSUS_COUNT =
  /(?:~\s{0,8})?\d{1,6}\s{0,8}компонент|\d{1,6}\s{0,8}(?:of|\/|из)\s{0,8}~?\s{0,8}\d{1,6}/i;

const UNSOLICITED_POOL = /начинаю с пул|start(?:ing)? with (?:a )?pool/i;

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

function leaksCatalogCensus(text: string): boolean {
  const normalized = text.toLowerCase();
  return CENSUS_PHRASES.some((phrase) => normalized.includes(phrase)) || CENSUS_COUNT.test(text);
}

/** Strip catalog-census chatter from the user-visible Architect reply. */
export function userFacingAssistantMessage(raw: string, opts?: { collaboration?: boolean }): string {
  const text = raw.trim();
  if (!text) return 'No semantic edits. Say what to add next.';
  if (leaksCatalogCensus(text)) return 'Updated the process from your request.';
  if (!opts?.collaboration && UNSOLICITED_POOL.test(text)) return 'Updated the process from your request.';
  return text;
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

export function toolSystemPrompt(input?: { process?: SemanticProcess; scope?: PlanOptions['scope'] }): string {
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
- Branch names label sequence flows; they do not create tasks. To put work on a branch, call addTask once per unique branch name using branchId after the split. This is required for parallel work; never leave requested parallel tasks as empty split-to-join arms.
- Lanes subdivide one participant. The first addLane creates the host participant automatically. Never use addPool for lane names, and never pass a Lane_* id as participantId; use a Participant_* id, a unique pool name, or omit participantId for the host pool.
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
