export type ShowcaseExample = {
  id: string;
  label: string;
  description: string;
  expectedNodeCount: number;
};

export const SHOWCASE_EXAMPLES: ShowcaseExample[] = [
  {
    id: 'linear',
    label: 'Linear process',
    description: 'Submit order, then process payment, then fulfill order, then dispatch shipment.',
    expectedNodeCount: 6, // StartEvent + 4 tasks + EndEvent
  },
  {
    id: 'decision',
    label: 'Decision flow',
    description: 'Receive application. If candidate is qualified then schedule interview otherwise send rejection.',
    expectedNodeCount: 6, // StartEvent + XOR Split + 2 branch tasks + XOR Join + EndEvent
  },
  {
    id: 'parallel',
    label: 'Parallel work',
    description: 'Onboard new employee, meanwhile prepare workstation and create email account.',
    expectedNodeCount: 6, // StartEvent + AND Split + 2 branch tasks + AND Join + EndEvent
  },
];
