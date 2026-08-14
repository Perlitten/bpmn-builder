import { ARTIFACTS, DATA, FLOWS, PARTICIPANTS } from './connectors.js';
import { EVENTS } from './events.js';
import { ACTIVITIES, GATEWAYS } from './nodes.js';
import type { BpmnComponentDefinition } from './types.js';

export const BPMN_COMPONENT_CATALOG: readonly BpmnComponentDefinition[] = [
  ...EVENTS,
  ...ACTIVITIES,
  ...GATEWAYS,
  ...FLOWS,
  ...PARTICIPANTS,
  ...DATA,
  ...ARTIFACTS,
];
