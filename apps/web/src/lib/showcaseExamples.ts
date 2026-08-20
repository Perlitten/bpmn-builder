export type ShowcaseExample = {
  id: string;
  label: string;
  description: string;
  regionCount: number;
  exclusiveGatewayCount: number;
  parallelGatewayCount: number;
  taskCount: number;
  taskNames: string[];
};

export const SHOWCASE_EXAMPLES: ShowcaseExample[] = [
  {
    id: 'linear',
    label: 'Linear process',
    description: 'Submit order. Process payment. Fulfill order. Dispatch shipment.',
    regionCount: 0,
    exclusiveGatewayCount: 0,
    parallelGatewayCount: 0,
    taskCount: 4,
    taskNames: ['Submit order', 'Process payment', 'Fulfill order', 'Dispatch shipment'],
  },
  {
    id: 'decision',
    label: 'Decision flow',
    description: 'Receive application. If the candidate is qualified, schedule an interview, otherwise send a rejection.',
    regionCount: 1,
    exclusiveGatewayCount: 2,
    parallelGatewayCount: 0,
    taskCount: 3,
    taskNames: ['Receive application', 'schedule an interview', 'send a rejection'],
  },
  {
    id: 'parallel',
    label: 'Parallel work',
    description: 'Receive the order. Reserve stock, meanwhile charge the card.',
    regionCount: 1,
    exclusiveGatewayCount: 0,
    parallelGatewayCount: 2,
    taskCount: 3,
    taskNames: ['Receive the order', 'Reserve stock', 'charge the card'],
  },
];
