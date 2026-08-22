export type ShowcaseNodeKind = 'start' | 'end' | 'gateway' | 'task';

type ShowcaseNode = {
  kind: ShowcaseNodeKind;
  label?: string;
};

export type ShowcaseScenario = {
  id: string;
  chipLabel: string;
  phrase: string;
  nodes: ShowcaseNode[];
  branches?: ShowcaseNode[][];
  branchLabels?: [string, string];
  tail: ShowcaseNode[];
};

export type ShowcasePoint = { x: number; y: number };

export type ShowcaseShape = ShowcaseNode & {
  cx: number;
  cy: number;
  width: number;
  height: number;
  order: number;
};

export type ShowcaseEdge = {
  order: number;
  points: ShowcasePoint[];
};

export type ShowcaseGeometry = {
  shapes: ShowcaseShape[];
  edges: ShowcaseEdge[];
  paths: ShowcasePoint[][];
  gatewayOrder: number;
  branchChoiceX: number[];
};

export type ShowcasePhase = 'type' | 'build' | 'run' | 'off';

export type ShowcasePlayback = {
  scenarioIndex: number;
  phase: ShowcasePhase;
  elapsed: number;
  lap: number;
};

export const SHOWCASE_TICK_MS = 84;
export const SHOWCASE_RUN_MS = 5_600;

export const SHOWCASE_SCENARIOS: ShowcaseScenario[] = [
  {
    id: 'approve-pay',
    chipLabel: 'Approve & pay',
    phrase: 'finance approves, then pay',
    nodes: [
      { kind: 'start' },
      { kind: 'task', label: 'APPROVE' },
      { kind: 'task', label: 'PAY' },
    ],
    tail: [{ kind: 'end' }],
  },
  {
    id: 'branch-amount',
    chipLabel: 'Branch on amount',
    phrase: 'if over 5000, ask the CFO',
    nodes: [
      { kind: 'start' },
      { kind: 'task', label: 'CHECK' },
      { kind: 'gateway' },
    ],
    branches: [
      [{ kind: 'task', label: 'CFO SIGN-OFF' }],
      [{ kind: 'task', label: 'AUTO APPROVE' }],
    ],
    branchLabels: ['OVER 5000', 'UNDER 5000'],
    tail: [{ kind: 'end' }],
  },
  {
    id: 'refund-alert',
    chipLabel: 'Refund alert',
    phrase: 'on refund, notify support',
    nodes: [
      { kind: 'start' },
      { kind: 'task', label: 'NOTIFY' },
    ],
    tail: [{ kind: 'end' }],
  },
  {
    id: 'ship-invoice',
    chipLabel: 'Ship & invoice',
    phrase: 'ship, invoice, then archive',
    nodes: [
      { kind: 'start' },
      { kind: 'task', label: 'SHIP' },
      { kind: 'task', label: 'INVOICE' },
      { kind: 'task', label: 'ARCHIVE' },
    ],
    tail: [{ kind: 'end' }],
  },
];

const STAGE_WIDTH = 500;
const MAIN_Y = 76;
const BRANCH_Y = [30, 122] as const;
const GAP = 36;
const NODE_WIDTH: Record<ShowcaseNodeKind, number> = {
  start: 34,
  end: 34,
  gateway: 46,
  task: 92,
};
const NODE_HEIGHT: Record<ShowcaseNodeKind, number> = {
  start: 34,
  end: 34,
  gateway: 32,
  task: 44,
};

function right(shape: ShowcaseShape): number {
  return shape.cx + shape.width / 2;
}

function left(shape: ShowcaseShape): number {
  return shape.cx - shape.width / 2;
}

export function buildShowcaseGeometry(scenario: ShowcaseScenario): ShowcaseGeometry {
  const shapes: ShowcaseShape[] = [];
  const edges: ShowcaseEdge[] = [];
  const paths: ShowcasePoint[][] = [];
  let x = 0;
  let order = 0;

  const put = (node: ShowcaseNode, cy: number, atX: number): ShowcaseShape => {
    const shape: ShowcaseShape = {
      ...node,
      cx: atX + NODE_WIDTH[node.kind] / 2,
      cy,
      width: NODE_WIDTH[node.kind],
      height: NODE_HEIGHT[node.kind],
      order,
    };
    order += 1;
    shapes.push(shape);
    return shape;
  };

  let previous: ShowcaseShape | null = null;
  for (const node of scenario.nodes) {
    const shape = put(node, MAIN_Y, x);
    if (previous) {
      edges.push({
        order: shape.order,
        points: [
          { x: right(previous), y: MAIN_Y },
          { x: left(shape), y: MAIN_Y },
        ],
      });
    }
    x += shape.width + GAP;
    previous = shape;
  }

  const gateway = previous;
  const branchChoiceX: number[] = [];

  if (scenario.branches && gateway) {
    const branchStartX = x;
    const branchEnds: Array<{ shape: ShowcaseShape; endX: number }> = [];

    scenario.branches.forEach((chain, branchIndex) => {
      const branchY = BRANCH_Y[branchIndex] ?? MAIN_Y;
      let branchX = branchStartX;
      let branchPrevious: ShowcaseShape | null = null;

      chain.forEach((node) => {
        const shape = put(node, branchY, branchX);
        if (branchPrevious) {
          edges.push({
            order: shape.order,
            points: [
              { x: right(branchPrevious), y: branchY },
              { x: left(shape), y: branchY },
            ],
          });
        } else {
          const junctionX = gateway.cx + 27;
          edges.push({
            order: shape.order,
            points: [
              { x: gateway.cx + 18, y: MAIN_Y },
              { x: junctionX, y: MAIN_Y },
              { x: junctionX, y: branchY },
              { x: left(shape), y: branchY },
            ],
          });
          branchChoiceX[branchIndex] = shape.cx;
        }
        branchX += shape.width + GAP;
        branchPrevious = shape;
      });

      if (branchPrevious) branchEnds.push({ shape: branchPrevious, endX: branchX });
    });

    let tailX = Math.max(...branchEnds.map((branch) => branch.endX));
    let tailPrevious: ShowcaseShape | null = null;
    const tailStartIndex = shapes.length;

    scenario.tail.forEach((node) => {
      const shape = put(node, MAIN_Y, tailX);
      if (tailPrevious) {
        edges.push({
          order: shape.order,
          points: [
            { x: right(tailPrevious), y: MAIN_Y },
            { x: left(shape), y: MAIN_Y },
          ],
        });
      } else {
        const joinX = left(shape) - 20;
        branchEnds.forEach((branch, branchIndex) => {
          const branchY = BRANCH_Y[branchIndex] ?? MAIN_Y;
          edges.push({
            order: shape.order,
            points: [
              { x: right(branch.shape), y: branchY },
              { x: joinX, y: branchY },
              { x: joinX, y: MAIN_Y },
              { x: left(shape), y: MAIN_Y },
            ],
          });
        });
      }
      tailX += shape.width + GAP;
      tailPrevious = shape;
    });
    x = tailX;

    const mainPath = shapes.slice(0, scenario.nodes.length).map((shape) => ({
      x: shape.cx,
      y: MAIN_Y,
    }));
    let branchOffset = scenario.nodes.length;
    scenario.branches.forEach((chain, branchIndex) => {
      const branchY = BRANCH_Y[branchIndex] ?? MAIN_Y;
      const junctionOutX = gateway.cx + 27;
      const branchShapes = shapes.slice(branchOffset, branchOffset + chain.length);
      const tailShapes = shapes.slice(tailStartIndex);
      const joinX = tailShapes.length > 0 ? left(tailShapes[0]) - 20 : right(branchShapes.at(-1) ?? gateway);
      paths.push([
        ...mainPath,
        { x: junctionOutX, y: MAIN_Y },
        { x: junctionOutX, y: branchY },
        ...branchShapes.map((shape) => ({ x: shape.cx, y: branchY })),
        { x: joinX, y: branchY },
        { x: joinX, y: MAIN_Y },
        ...tailShapes.map((shape) => ({ x: shape.cx, y: MAIN_Y })),
      ]);
      branchOffset += chain.length;
    });
  } else {
    let tailPrevious = previous;
    scenario.tail.forEach((node) => {
      const shape = put(node, MAIN_Y, x);
      if (tailPrevious) {
        edges.push({
          order: shape.order,
          points: [
            { x: right(tailPrevious), y: MAIN_Y },
            { x: left(shape), y: MAIN_Y },
          ],
        });
      }
      x += shape.width + GAP;
      tailPrevious = shape;
    });
    paths.push(shapes.map((shape) => ({ x: shape.cx, y: MAIN_Y })));
  }

  const contentWidth = x - GAP;
  const offsetX = Math.max(0, (STAGE_WIDTH - contentWidth) / 2);
  shapes.forEach((shape) => {
    shape.cx += offsetX;
  });
  edges.forEach((edge) => {
    edge.points.forEach((point) => {
      point.x += offsetX;
    });
  });
  paths.forEach((path) => {
    path.forEach((point) => {
      point.x += offsetX;
    });
  });
  branchChoiceX.forEach((value, index) => {
    branchChoiceX[index] = value + offsetX;
  });

  return {
    shapes,
    edges,
    paths,
    gatewayOrder: scenario.branches ? (gateway?.order ?? -1) : -1,
    branchChoiceX,
  };
}

export const SHOWCASE_GEOMETRIES = SHOWCASE_SCENARIOS.map(buildShowcaseGeometry);

export function showcasePhaseDuration(scenarioIndex: number, phase: ShowcasePhase): number {
  const scenario = SHOWCASE_SCENARIOS[scenarioIndex] ?? SHOWCASE_SCENARIOS[0];
  if (phase === 'type') return scenario.phrase.length * 52 + 500;
  if (phase === 'build') return SHOWCASE_GEOMETRIES[scenarioIndex].shapes.length * 190 + 260;
  if (phase === 'run') return SHOWCASE_RUN_MS;
  return 450;
}

export function advanceShowcasePlayback(
  playback: ShowcasePlayback,
  delta = SHOWCASE_TICK_MS,
): ShowcasePlayback {
  const elapsed = playback.elapsed + delta;
  if (elapsed < showcasePhaseDuration(playback.scenarioIndex, playback.phase)) {
    return { ...playback, elapsed };
  }

  if (playback.phase === 'type') return { ...playback, phase: 'build', elapsed: 0 };
  if (playback.phase === 'build') return { ...playback, phase: 'run', elapsed: 0 };
  if (playback.phase === 'run') return { ...playback, phase: 'off', elapsed: 0 };
  return {
    scenarioIndex: (playback.scenarioIndex + 1) % SHOWCASE_SCENARIOS.length,
    phase: 'type',
    elapsed: 0,
    lap: playback.lap + 1,
  };
}

export function showcaseXml(scenarioIndex: number): string {
  const scenario = SHOWCASE_SCENARIOS[scenarioIndex] ?? SHOWCASE_SCENARIOS[0];
  const lines = [
    '<bpmn:process id="Process_1" isExecutable="true">',
    '  <bpmn:startEvent id="StartEvent_1" />',
  ];
  let activity = 1;
  const titleCase = (value: string): string => value.charAt(0) + value.slice(1).toLowerCase();

  scenario.nodes.filter((node) => node.kind === 'task').forEach((node) => {
    lines.push(`  <bpmn:userTask id="Activity_${activity}" name="${titleCase(node.label ?? '')}" />`);
    activity += 1;
  });

  if (scenario.branches) {
    lines.push('  <bpmn:exclusiveGateway id="Gateway_1" />');
    scenario.branches.forEach((branch) => {
      lines.push(
        `  <bpmn:userTask id="Activity_${activity}" name="${titleCase(branch[0]?.label ?? '')}" />`,
      );
      activity += 1;
    });
    lines.push(
      '  <bpmn:sequenceFlow id="Flow_2" sourceRef="Gateway_1"',
      '    targetRef="Activity_2">',
      '    <bpmn:conditionExpression>amount &gt; 5000',
      '    </bpmn:conditionExpression>',
      '  </bpmn:sequenceFlow>',
    );
  }

  lines.push('  <bpmn:endEvent id="EndEvent_1" />', '</bpmn:process>');
  return lines.join('\n');
}

export function pointAtShowcasePath(path: ShowcasePoint[], progress: number): ShowcasePoint {
  if (path.length === 0) return { x: 0, y: 0 };
  if (progress <= 0) return path[0];
  if (progress >= 1) return path[path.length - 1];

  const lengths = path.slice(1).map((point, index) => {
    const previous = path[index];
    return Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
  });
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const wanted = progress * total;
  let accumulated = 0;

  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (accumulated + length >= wanted) {
      const from = path[index];
      const to = path[index + 1];
      const fraction = length === 0 ? 0 : (wanted - accumulated) / length;
      return {
        x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction,
      };
    }
    accumulated += length;
  }

  return path[path.length - 1];
}
