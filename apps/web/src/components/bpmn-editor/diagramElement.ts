const ANCESTORS: Record<string, readonly string[]> = {
  'bpmn:Task': ['bpmn:Activity', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:UserTask': ['bpmn:Task', 'bpmn:Activity', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:ServiceTask': ['bpmn:Task', 'bpmn:Activity', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:SendTask': ['bpmn:Task', 'bpmn:Activity', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:ReceiveTask': ['bpmn:Task', 'bpmn:Activity', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:ScriptTask': ['bpmn:Task', 'bpmn:Activity', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:BusinessRuleTask': ['bpmn:Task', 'bpmn:Activity', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:ManualTask': ['bpmn:Task', 'bpmn:Activity', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:CallActivity': ['bpmn:Activity', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:SubProcess': ['bpmn:Activity', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:Transaction': ['bpmn:SubProcess', 'bpmn:Activity', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:StartEvent': ['bpmn:CatchEvent', 'bpmn:Event', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:EndEvent': ['bpmn:ThrowEvent', 'bpmn:Event', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:IntermediateCatchEvent': ['bpmn:CatchEvent', 'bpmn:Event', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:IntermediateThrowEvent': ['bpmn:ThrowEvent', 'bpmn:Event', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:BoundaryEvent': ['bpmn:CatchEvent', 'bpmn:Event', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:ExclusiveGateway': ['bpmn:Gateway', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:InclusiveGateway': ['bpmn:Gateway', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:ParallelGateway': ['bpmn:Gateway', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:EventBasedGateway': ['bpmn:Gateway', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:ComplexGateway': ['bpmn:Gateway', 'bpmn:FlowNode', 'bpmn:FlowElement'],
  'bpmn:Participant': ['bpmn:InteractionNode'],
  'bpmn:Lane': [],
};

export type DiagramElement = {
  id: string;
  type: string;
  businessObject?: {
    $type?: string;
    name?: string;
    text?: string;
    eventDefinitions?: Array<{ $type?: string }>;
    isForCompensation?: boolean;
    triggeredByEvent?: boolean;
    isInterrupting?: boolean;
    cancelActivity?: boolean;
    conditionExpression?: { body?: string };
    default?: { id?: string } | string;
  };
  incoming?: DiagramElement[];
  outgoing?: DiagramElement[];
  source?: DiagramElement;
  target?: DiagramElement;
  host?: DiagramElement;
  parent?: DiagramElement;
  labelTarget?: DiagramElement;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export function isBpmnType(element: { type?: string } | null | undefined, type: string): boolean {
  if (!element?.type) return false;
  if (element.type === type) return true;
  return (ANCESTORS[element.type] ?? []).includes(type);
}
