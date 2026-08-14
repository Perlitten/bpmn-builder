import {
  BPMN,
  ENGINES,
  FLOW_PARENTS,
  GATEWAY_TYPES,
  SEQUENCE_FLOW_NODES,
  TASK_TYPES,
  component,
  inFlowScope,
  replaceContext,
} from './define.js';
import type { BpmnComponentDefinition, EngineSupport, LayoutBehavior } from './types.js';

const TASK_REPLACE = new Set<string>([...TASK_TYPES, BPMN.callActivity]);
const SUBPROCESS_REPLACE = new Set<string>([BPMN.subProcess, BPMN.transaction, BPMN.adHoc]);
const GATEWAY_REPLACE = new Set<string>(GATEWAY_TYPES);
const EVENT_BASED_TARGETS = [BPMN.catch, BPMN.receiveTask] as const;

function activity(spec: {
  id: string;
  bpmnType: string;
  title: string;
  meaning: string;
  use: readonly string[];
  not: readonly string[];
  engine: EngineSupport;
  layout?: LayoutBehavior;
  subprocessFamily?: boolean;
}): BpmnComponentDefinition {
  const family = spec.subprocessFamily ? SUBPROCESS_REPLACE : TASK_REPLACE;
  return component({
    id: spec.id,
    bpmnType: spec.bpmnType,
    category: 'activities',
    title: spec.title,
    allowedParents: FLOW_PARENTS,
    allowedSources: SEQUENCE_FLOW_NODES,
    allowedTargets: SEQUENCE_FLOW_NODES,
    canCreate: (ctx) => inFlowScope(ctx),
    canReplace: (el) => family.has(el.bpmnType) && inFlowScope(replaceContext(el)),
    semanticMeaning: spec.meaning,
    useFor: spec.use,
    doNotUseFor: spec.not,
    layoutBehavior: spec.layout ?? { placement: 'flowNode' },
    engineSupport: spec.engine,
  });
}

function gateway(spec: {
  id: string;
  bpmnType: string;
  title: string;
  meaning: string;
  use: readonly string[];
  not: readonly string[];
  engine: EngineSupport;
  allowedTargets?: readonly string[];
}): BpmnComponentDefinition {
  const allowedTargets = spec.allowedTargets ?? SEQUENCE_FLOW_NODES;
  return component({
    id: spec.id,
    bpmnType: spec.bpmnType,
    category: 'gateways',
    title: spec.title,
    allowedParents: FLOW_PARENTS,
    allowedSources: SEQUENCE_FLOW_NODES,
    allowedTargets,
    canCreate: (ctx) => inFlowScope(ctx),
    canReplace: (el) => GATEWAY_REPLACE.has(el.bpmnType) && inFlowScope(replaceContext(el)),
    semanticMeaning: spec.meaning,
    useFor: spec.use,
    doNotUseFor: spec.not,
    layoutBehavior: { placement: 'flowNode' },
    engineSupport: spec.engine,
  });
}

export const ACTIVITIES: BpmnComponentDefinition[] = [
  activity({
    id: 'activity.task',
    bpmnType: BPMN.task,
    title: 'Task',
    meaning: 'Abstract unit of work with no performer type. Prefer a typed task once the performer is known.',
    use: ['placeholder work', 'unspecified performer'],
    not: ['human work — use user task', 'system/API work — use service task', 'script or rule evaluation'],
    engine: ENGINES.c8,
  }),
  activity({
    id: 'activity.userTask',
    bpmnType: BPMN.userTask,
    title: 'User Task',
    meaning: 'Work performed by a human through a task list or form; the token waits for completion.',
    use: ['human decision or data entry', 'assignee / candidate group work', 'form-backed step'],
    not: ['automatic API call — use service task', 'pure delay — use timer catch'],
    engine: ENGINES.c8,
  }),
  activity({
    id: 'activity.serviceTask',
    bpmnType: BPMN.serviceTask,
    title: 'Service Task',
    meaning: 'Work performed by an application or connector (job worker / external service).',
    use: ['call an API or worker', 'system-to-system step', 'job worker in Camunda 8'],
    not: ['human form — use user task', 'DMN decision — use business rule task'],
    engine: ENGINES.c8,
  }),
  activity({
    id: 'activity.sendTask',
    bpmnType: BPMN.sendTask,
    title: 'Send Task',
    meaning: 'Sends a message as an activity (visible as work, not only as a throw event).',
    use: ['send a message as a modeled step', 'outbound notification with task semantics'],
    not: ['wait for a reply — use receive task or message catch', 'fire-and-forget throw without task semantics — use throw message'],
    engine: ENGINES.c8,
  }),
  activity({
    id: 'activity.receiveTask',
    bpmnType: BPMN.receiveTask,
    title: 'Receive Task',
    meaning: 'Waits for a message as an activity. Legal outgoing of an event-based gateway.',
    use: ['wait for a message as a task', 'event-based gateway branch that receives'],
    not: ['send a message', 'timeout on running work — use boundary.timer'],
    engine: ENGINES.c8,
  }),
  activity({
    id: 'activity.manualTask',
    bpmnType: BPMN.manualTask,
    title: 'Manual Task',
    meaning: 'Work done by a human outside the engine; the engine does not assign a user task.',
    use: ['offline / paper / physical work', 'work the engine does not schedule'],
    not: ['work in the task list — use user task', 'automated worker — use service task'],
    engine: ENGINES.c8,
  }),
  activity({
    id: 'activity.businessRuleTask',
    bpmnType: BPMN.businessRuleTask,
    title: 'Business Rule Task',
    meaning: 'Evaluates a decision (typically DMN) and continues with the result.',
    use: ['DMN decision', 'rule table lookup'],
    not: ['human judgement — use user task', 'arbitrary script — use script task'],
    engine: ENGINES.c8,
  }),
  activity({
    id: 'activity.scriptTask',
    bpmnType: BPMN.scriptTask,
    title: 'Script Task',
    meaning: 'Runs a script in the engine (or a script job) to transform data.',
    use: ['inline data transform', 'scripted calculation'],
    not: ['external API — use service task', 'DMN — use business rule task'],
    engine: ENGINES.c8,
  }),
  activity({
    id: 'activity.subProcess',
    bpmnType: BPMN.subProcess,
    title: 'Subprocess',
    subprocessFamily: true,
    layout: { placement: 'container' },
    meaning: 'An embedded subprocess with its own start/end; collapsed or expanded. Groups a structured fragment.',
    use: ['nest a structured fragment', 'scope events and compensation'],
    not: ['call a reusable process definition — use call activity', 'ad-hoc unordered work — use ad-hoc subprocess'],
    engine: ENGINES.c8,
  }),
  activity({
    id: 'activity.eventSubProcess',
    bpmnType: BPMN.subProcess,
    title: 'Event Subprocess',
    subprocessFamily: true,
    layout: { placement: 'container' },
    meaning: 'A subprocess started by an event (message, timer, error, …), not by sequence flow. triggeredByEvent=true.',
    use: ['error/timer/message handler for the parent scope', 'interrupting or non-interrupting side process'],
    not: ['ordinary nested fragment on the happy path — use subprocess', 'attach a timer to one activity — use boundary.timer'],
    engine: ENGINES.c8,
  }),
  activity({
    id: 'activity.transaction',
    bpmnType: BPMN.transaction,
    title: 'Transaction',
    subprocessFamily: true,
    layout: { placement: 'container' },
    meaning: 'A subprocess with ACID-like cancel/compensation: cancel end and cancel boundary are legal only here.',
    use: ['all-or-nothing business transaction', 'host for cancel end / cancel boundary'],
    not: ['Camunda 8 / Zeebe — transactions are not executable there', 'ordinary grouping — use subprocess'],
    engine: ENGINES.c7,
  }),
  activity({
    id: 'activity.adHocSubProcess',
    bpmnType: BPMN.adHoc,
    title: 'Ad-hoc Subprocess',
    subprocessFamily: true,
    layout: { placement: 'container' },
    meaning: 'Inner activities may run in any order, possibly repeatedly, until a completion condition.',
    use: ['unordered optional inner work', 'knowledge-work fragment without a fixed sequence'],
    not: ['fixed sequence — use subprocess', 'XOR split — use exclusive gateway'],
    engine: ENGINES.partial,
  }),
  activity({
    id: 'activity.callActivity',
    bpmnType: BPMN.callActivity,
    title: 'Call Activity',
    meaning: 'Invokes a reusable called process (or global task) and waits for it to complete.',
    use: ['reuse another process definition', 'call a child process'],
    not: ['inline fragment in this process — use subprocess', 'message another pool without calling a process — use message flow'],
    engine: ENGINES.c8,
  }),
];

export const GATEWAYS: BpmnComponentDefinition[] = [
  gateway({
    id: 'gateway.exclusive',
    bpmnType: BPMN.exclusive,
    title: 'Exclusive Gateway',
    meaning: 'XOR split/join: exactly one outgoing branch is taken (conditions / default). Join passes each incoming token independently.',
    use: ['one path', 'decision with mutually exclusive outcomes', 'Decision → XOR'],
    not: ['run all paths — use parallel', 'several conditions may be true — use inclusive', 'wait for whichever event occurs first — use event-based'],
    engine: ENGINES.c8,
  }),
  gateway({
    id: 'gateway.parallel',
    bpmnType: BPMN.parallel,
    title: 'Parallel Gateway',
    meaning: 'AND split/join: all outgoing branches run; join waits for all incoming tokens. No conditions on outgoing flows.',
    use: ['run all paths', 'fork then join concurrent work', 'Decision → Parallel'],
    not: ['choose one path — use exclusive', 'conditional concurrency — use inclusive'],
    engine: ENGINES.c8,
  }),
  gateway({
    id: 'gateway.inclusive',
    bpmnType: BPMN.inclusive,
    title: 'Inclusive Gateway',
    meaning: 'OR split/join: every outgoing flow whose condition is true is taken; join waits for active incoming tokens.',
    use: ['several conditions may be true', 'optional parallel combinations', 'Decision → OR'],
    not: ['exactly one path — use exclusive', 'always all paths — use parallel'],
    engine: ENGINES.c8,
  }),
  gateway({
    id: 'gateway.complex',
    bpmnType: BPMN.complex,
    title: 'Complex Gateway',
    meaning: 'Split/join with a custom activation condition. Rare; prefer XOR/AND/OR.',
    use: ['non-standard merge (N of M) that XOR/AND/OR cannot express'],
    not: ['Camunda 8 / Zeebe', 'ordinary decisions — use exclusive/inclusive/parallel'],
    engine: ENGINES.c7,
  }),
  gateway({
    id: 'gateway.eventBased',
    bpmnType: BPMN.eventBased,
    title: 'Event-Based Gateway',
    allowedTargets: EVENT_BASED_TARGETS,
    meaning: 'Waits for whichever following catch event (or receive task) occurs first; that branch continues, the others are cancelled.',
    use: [
      'wait for whichever event occurs first',
      'competing future events after the previous activity has completed',
      'payment or cancellation, whichever arrives',
      'Decision → Event-Based',
    ],
    not: [
      'timeout during an activity that is still active — use boundary.timer',
      'data-based XOR on variables — use exclusive',
      'run all event paths — use parallel',
    ],
    engine: ENGINES.c8,
  }),
];
