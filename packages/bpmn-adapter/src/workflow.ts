import type { WorkflowDocument } from '../../domain/src/index.js';
import { detectStructure, type FlowNode, type FlowNodeType, type Process, type SequenceFlow } from '../../semantic-core/src/index.js';
import { layoutProcess } from '../../layout-engine/src/index.js';
import { exportProcessXml, idSeqFrom, xmlToProcess } from './semantic-xml.js';

const FROM_WORKFLOW: Record<string, { type: FlowNodeType; bpmnType: string }> = {
  startEvent: { type: 'start', bpmnType: 'bpmn:StartEvent' },
  endEvent: { type: 'end', bpmnType: 'bpmn:EndEvent' },
  task: { type: 'task', bpmnType: 'bpmn:Task' },
  userTask: { type: 'task', bpmnType: 'bpmn:UserTask' },
  serviceTask: { type: 'task', bpmnType: 'bpmn:ServiceTask' },
  sendTask: { type: 'task', bpmnType: 'bpmn:SendTask' },
  receiveTask: { type: 'task', bpmnType: 'bpmn:ReceiveTask' },
  manualTask: { type: 'task', bpmnType: 'bpmn:ManualTask' },
  businessRuleTask: { type: 'task', bpmnType: 'bpmn:BusinessRuleTask' },
  scriptTask: { type: 'task', bpmnType: 'bpmn:ScriptTask' },
  exclusiveGateway: { type: 'exclusiveGateway', bpmnType: 'bpmn:ExclusiveGateway' },
  parallelGateway: { type: 'parallelGateway', bpmnType: 'bpmn:ParallelGateway' },
  inclusiveGateway: { type: 'inclusiveGateway', bpmnType: 'bpmn:InclusiveGateway' },
  eventBasedGateway: { type: 'eventBasedGateway', bpmnType: 'bpmn:EventBasedGateway' },
};

function workflowType(node: FlowNode): string {
  const raw = node.bpmnType?.replace(/^bpmn:/, '') ?? '';
  if (raw === 'UserTask') return 'userTask';
  if (raw === 'ServiceTask') return 'serviceTask';
  if (raw === 'SendTask') return 'sendTask';
  if (raw === 'ReceiveTask') return 'receiveTask';
  if (raw === 'ManualTask') return 'manualTask';
  if (raw === 'BusinessRuleTask') return 'businessRuleTask';
  if (raw === 'ScriptTask') return 'scriptTask';
  if (node.type === 'start') return 'startEvent';
  if (node.type === 'end') return 'endEvent';
  return node.type;
}

function processToWorkflow(process: Process): WorkflowDocument {
  const di = layoutProcess(process);
  const defaults = new Map<string, string>();
  for (const flow of process.flows) {
    if (flow.isDefault) defaults.set(flow.source, flow.id);
  }
  return {
    processId: process.id,
    nodes: process.nodes.map((node) => {
      const box = di.shapes[node.id];
      const data: Record<string, unknown> = {};
      if (box) {
        data.width = box.width;
        data.height = box.height;
      }
      const def = defaults.get(node.id);
      if (def) data.default = def;
      return {
        id: node.id,
        type: workflowType(node),
        label: node.name,
        ...(box ? { x: box.x, y: box.y } : {}),
        ...(Object.keys(data).length ? { data } : {}),
      };
    }),
    edges: process.flows.map((flow) => ({
      id: flow.id,
      source: flow.source,
      target: flow.target,
      ...(flow.name ? { label: flow.name } : {}),
      ...(flow.condition ? { condition: flow.condition } : {}),
    })),
  };
}

export function workflowToProcess(workflow: WorkflowDocument): Process {
  const processId = workflow.processId?.trim() || 'Process_1';
  const nodes: FlowNode[] = workflow.nodes.map((node) => {
    const mapped = FROM_WORKFLOW[node.type] ?? { type: 'task' as const, bpmnType: 'bpmn:Task' };
    return { id: node.id, type: mapped.type, name: node.label ?? '', bpmnType: mapped.bpmnType };
  });
  const flows: SequenceFlow[] = workflow.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.label ? { name: edge.label } : {}),
    ...(edge.condition ? { condition: edge.condition } : {}),
  }));
  for (const node of workflow.nodes) {
    const def = node.data?.default;
    if (typeof def !== 'string') continue;
    const flow = flows.find((f) => f.id === def);
    if (flow) flow.isDefault = true;
  }
  const ids = [processId, ...nodes.map((n) => n.id), ...flows.map((f) => f.id), 'Scope_1'];
  return detectStructure({
    id: processId,
    name: 'Process',
    rootScopeId: 'Scope_1',
    idSeq: { ...idSeqFrom(ids), Scope: 1 },
    scopes: [
      {
        id: 'Scope_1',
        parentId: null,
        ownerId: null,
        nodeIds: nodes.map((n) => n.id),
        flowIds: flows.map((f) => f.id),
      },
    ],
    nodes,
    flows,
    regions: [],
    unstructured: [],
    feedback: [],
    exceptionBranches: [],
    participants: [],
    lanes: [],
    messageFlows: [],
    processes: [],
  });
}

/** Persistence DTO from XML. Positions come from canonical layout, not imported DI. */
export async function bpmnToWorkflow(bpmnXml: string): Promise<WorkflowDocument> {
  if (!bpmnXml.trim()) return { nodes: [], edges: [] };
  return processToWorkflow(await xmlToProcess(bpmnXml));
}

/** Workflow DTO → BPMN XML via the semantic graph and layout engine. */
export function workflowToBpmn(workflow: WorkflowDocument): string {
  return exportProcessXml(workflowToProcess(workflow));
}
