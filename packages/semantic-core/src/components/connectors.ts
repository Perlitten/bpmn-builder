import {
  BPMN,
  CONDITIONAL_SOURCES,
  DEFAULT_SOURCES,
  ENGINES,
  FLOW_NODE_SET,
  FLOW_PARENTS,
  MESSAGE_ENDPOINTS,
  SEQUENCE_FLOW_NODES,
  component,
  inFlowScope,
  parentOk,
} from './define.js';
import type { BpmnComponentDefinition, ComponentContext } from './types.js';

function sequenceLike(ctx: ComponentContext): boolean {
  if (!inFlowScope(ctx)) return false;
  if (ctx.sourceBpmnType && !FLOW_NODE_SET.has(ctx.sourceBpmnType)) return false;
  if (ctx.targetBpmnType && !FLOW_NODE_SET.has(ctx.targetBpmnType)) return false;
  return true;
}

export const FLOWS: BpmnComponentDefinition[] = [
  component({
    id: 'flow.sequence',
    bpmnType: BPMN.sequenceFlow,
    category: 'flows',
    title: 'Sequence Flow',
    allowedParents: FLOW_PARENTS,
    allowedSources: SEQUENCE_FLOW_NODES,
    allowedTargets: SEQUENCE_FLOW_NODES,
    canCreate: sequenceLike,
    canReplace: (el) => el.bpmnType === BPMN.sequenceFlow,
    semanticMeaning: 'Control flow inside one process: the token moves from source to target with no condition.',
    useFor: ['happy-path continuation', 'unconditional next step in the same process'],
    doNotUseFor: ['cross-pool communication — use message flow', 'conditional branch — use conditional or default flow'],
    layoutBehavior: { placement: 'sequenceFlow' },
    engineSupport: ENGINES.c8,
  }),
  component({
    id: 'flow.conditional',
    bpmnType: BPMN.sequenceFlow,
    category: 'flows',
    title: 'Conditional Sequence Flow',
    allowedParents: FLOW_PARENTS,
    allowedSources: [...CONDITIONAL_SOURCES],
    allowedTargets: SEQUENCE_FLOW_NODES,
    canCreate: (ctx) => sequenceLike(ctx) && (!ctx.sourceBpmnType || CONDITIONAL_SOURCES.has(ctx.sourceBpmnType)),
    canReplace: (el) => el.bpmnType === BPMN.sequenceFlow,
    semanticMeaning: 'Sequence flow taken only when its condition is true. Source is an activity or XOR/OR gateway, not AND or event-based.',
    useFor: ['guarded outgoing from a task or XOR/OR', 'condition on a branch'],
    doNotUseFor: ['parallel gateway outgoing — AND flows are unconditional', 'event-based gateway outgoing — those wait on events, not data'],
    layoutBehavior: { placement: 'sequenceFlow' },
    engineSupport: ENGINES.c8,
  }),
  component({
    id: 'flow.default',
    bpmnType: BPMN.sequenceFlow,
    category: 'flows',
    title: 'Default Sequence Flow',
    allowedParents: FLOW_PARENTS,
    allowedSources: [...DEFAULT_SOURCES],
    allowedTargets: SEQUENCE_FLOW_NODES,
    canCreate: (ctx) => sequenceLike(ctx) && (!ctx.sourceBpmnType || DEFAULT_SOURCES.has(ctx.sourceBpmnType)),
    canReplace: (el) => el.bpmnType === BPMN.sequenceFlow,
    semanticMeaning: 'The unmarked outgoing taken when no conditional flow from that source is true (slash on the connector).',
    useFor: ['else / otherwise branch', 'fallback from XOR, OR, or an activity with conditions'],
    doNotUseFor: ['the only outgoing of a task — use plain sequence flow', 'parallel split'],
    layoutBehavior: { placement: 'sequenceFlow' },
    engineSupport: ENGINES.c8,
  }),
  component({
    id: 'flow.message',
    bpmnType: BPMN.messageFlow,
    category: 'flows',
    title: 'Message Flow',
    allowedParents: [BPMN.collaboration, BPMN.definitions],
    allowedSources: [...MESSAGE_ENDPOINTS],
    allowedTargets: [...MESSAGE_ENDPOINTS],
    canCreate: (ctx) => {
      const parent = ctx.parentBpmnType ?? BPMN.process;
      const collab = parent === BPMN.collaboration || parent === BPMN.definitions;
      if (!collab && !ctx.sourceBpmnType) return false;
      if (ctx.sourceBpmnType && !MESSAGE_ENDPOINTS.has(ctx.sourceBpmnType)) return false;
      if (ctx.targetBpmnType && !MESSAGE_ENDPOINTS.has(ctx.targetBpmnType)) return false;
      return true;
    },
    semanticMeaning: 'Interaction between participants: a message crosses pools. Never used inside a single process.',
    useFor: ['send between pools', 'collaboration conversation', 'choreography-style link in a collaboration'],
    doNotUseFor: ['next step in the same process — use sequence flow', 'annotation — use association'],
    layoutBehavior: { placement: 'messageFlow' },
    engineSupport: ENGINES.c8,
  }),
  component({
    id: 'flow.association',
    bpmnType: BPMN.association,
    category: 'flows',
    title: 'Association',
    allowedParents: [...FLOW_PARENTS, BPMN.collaboration],
    canCreate: (ctx) => parentOk([...FLOW_PARENTS, BPMN.collaboration], ctx),
    semanticMeaning: 'Dotted undirected (or directed) link from an artifact, typically a text annotation, to an element.',
    useFor: ['attach a comment to a node', 'link a group visually'],
    doNotUseFor: ['token movement — use sequence flow', 'data input/output wiring — use data association'],
    layoutBehavior: { placement: 'association' },
    engineSupport: ENGINES.partial,
  }),
  component({
    id: 'flow.dataAssociation',
    bpmnType: BPMN.dataAssociation,
    category: 'flows',
    title: 'Data Association',
    allowedParents: FLOW_PARENTS,
    canCreate: (ctx) => inFlowScope(ctx),
    semanticMeaning: 'Maps a data object/store/input/output to an activity or event (read or write).',
    useFor: ['wire a data object into a task', 'show data produced by an activity'],
    doNotUseFor: ['control flow', 'message between pools'],
    layoutBehavior: { placement: 'association' },
    engineSupport: ENGINES.partial,
  }),
];

export const PARTICIPANTS: BpmnComponentDefinition[] = [
  component({
    id: 'participant.pool',
    bpmnType: BPMN.participant,
    category: 'participants',
    title: 'Pool',
    allowedParents: [BPMN.collaboration, BPMN.definitions, BPMN.process],
    canCreate: (ctx) => {
      const parent = ctx.parentBpmnType ?? BPMN.process;
      return parent === BPMN.collaboration || parent === BPMN.definitions || parent === BPMN.process;
    },
    semanticMeaning: 'A participant in a collaboration: a process, a black box, or an external partner. Sequence flow does not cross pools.',
    useFor: ['this process vs another organization', 'black-box partner', 'collaboration diagram'],
    doNotUseFor: ['internal responsibility swimlanes — use lane', 'nesting work — use subprocess'],
    layoutBehavior: { placement: 'pool' },
    engineSupport: ENGINES.c8,
  }),
  component({
    id: 'participant.lane',
    bpmnType: BPMN.lane,
    category: 'participants',
    title: 'Lane',
    allowedParents: [BPMN.participant, BPMN.lane],
    canCreate: (ctx) => {
      const parent = ctx.parentBpmnType ?? BPMN.process;
      return parent === BPMN.participant || parent === BPMN.lane;
    },
    semanticMeaning: 'A subdivision of a pool for responsibility (role, team, system). Does not change token semantics.',
    useFor: ['assign work to a role or team', 'partition a pool'],
    doNotUseFor: ['another organization — use a second pool', 'conditional branching'],
    layoutBehavior: { placement: 'lane' },
    engineSupport: ENGINES.c8,
  }),
];

export const DATA: BpmnComponentDefinition[] = [
  component({
    id: 'data.object',
    bpmnType: BPMN.dataObject,
    category: 'data',
    title: 'Data Object',
    allowedParents: FLOW_PARENTS,
    canCreate: (ctx) => inFlowScope(ctx),
    semanticMeaning: 'A data object (diagram reference) representing information created, read, or updated in this process.',
    useFor: ['document or payload produced/consumed by tasks', 'visible data on the diagram'],
    doNotUseFor: ['durable store shared across instances — use data store', 'message to another pool — use message flow'],
    layoutBehavior: { placement: 'data' },
    engineSupport: ENGINES.partial,
  }),
  component({
    id: 'data.store',
    bpmnType: BPMN.dataStore,
    category: 'data',
    title: 'Data Store',
    allowedParents: [...FLOW_PARENTS, BPMN.collaboration],
    canCreate: (ctx) => parentOk([...FLOW_PARENTS, BPMN.collaboration], ctx),
    semanticMeaning: 'A persistent store that outlives a single instance (database, archive).',
    useFor: ['database or shared repository', 'data that survives the instance'],
    doNotUseFor: ['transient payload of this instance — use data object'],
    layoutBehavior: { placement: 'data' },
    engineSupport: ENGINES.partial,
  }),
];

export const ARTIFACTS: BpmnComponentDefinition[] = [
  component({
    id: 'artifact.group',
    bpmnType: BPMN.group,
    category: 'artifacts',
    title: 'Group',
    allowedParents: [...FLOW_PARENTS, BPMN.collaboration],
    canCreate: (ctx) => parentOk([...FLOW_PARENTS, BPMN.collaboration], ctx),
    semanticMeaning: 'A visual category around elements. No effect on execution or tokens.',
    useFor: ['highlight a related set of nodes', 'documentation grouping'],
    doNotUseFor: ['execution scope — use subprocess', 'responsibility — use lane'],
    layoutBehavior: { placement: 'artifact' },
    engineSupport: ENGINES.partial,
  }),
  component({
    id: 'artifact.textAnnotation',
    bpmnType: BPMN.textAnnotation,
    category: 'artifacts',
    title: 'Text Annotation',
    allowedParents: [...FLOW_PARENTS, BPMN.collaboration],
    canCreate: (ctx) => parentOk([...FLOW_PARENTS, BPMN.collaboration], ctx),
    semanticMeaning: 'A comment attached via association. No effect on execution.',
    useFor: ['note for modelers or auditors', 'explain a gateway condition in prose'],
    doNotUseFor: ['executable condition — put that on the sequence flow', 'user-facing task form'],
    layoutBehavior: { placement: 'artifact' },
    engineSupport: ENGINES.partial,
  }),
];
