/** Product geometry tokens — not OMG. Spacing is between shape boundaries. */
export const TOKENS = {
  baseGrid: 8,
  task: { width: 120, height: 72 },
  gateway: { width: 48, height: 48 },
  event: { width: 40, height: 40 },
  forwardFlowGap: 96,
  /** Wider sequence-flow gap for graphs laid out inside a pool/lane. */
  poolInnerFlowGap: 144,
  branchGap: 64,
  edgeClearance: 24,
  poolHeader: 32,
  poolPad: 48,
  poolGap: 64,
  blackBox: { width: 480, height: 160 },
  laneMinHeight: 80,
  subprocessPad: 24,
  eventSubprocessGap: 64,
  /** External BPMN labels (events/gateways/named flows). Min size ≥ bpmn-js DEFAULT_LABEL_SIZE. */
  label: { width: 90, height: 24, gap: 12, charWidth: 8, padX: 16, flowIndent: 15 },
} as const;

export const ORIGIN_X = 10 * TOKENS.baseGrid;

/** Happy-path center Y. A 2-task XOR diamond then has its upper task top at 80. */
export const BASELINE_CY =
  80 + TOKENS.task.height / 2 + TOKENS.branchGap / 2 + TOKENS.task.height / 2;

export function snapToGrid(value: number, grid = TOKENS.baseGrid): number {
  return Math.round(value / grid) * grid + 0;
}
