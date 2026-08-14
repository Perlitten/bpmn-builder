export type RuleLayer = 1 | 2 | 3 | 4 | 5;

export type FindingSeverity = 'error' | 'warning' | 'style' | 'suggestion';

export type Finding = {
  id: string;
  layer: RuleLayer;
  severity: FindingSeverity;
  message: string;
  elementId?: string;
};

/** Camunda 8 executes on Zeebe. `none` skips layer 2 — do not fake Execution 100. */
export type ExecutionProfile = 'camunda8' | 'zeebe' | 'neutral';

export const DEFAULT_EXECUTION_PROFILE: ExecutionProfile = 'camunda8';

/** Layer 2 is scored only when an execution profile ran. Layer 4 only when DI can be compared. */
export type LintScores = {
  bpmn: number;
  style: number;
  quality: number;
  execution?: number;
  geometry?: number;
};

export type LayoutSource = 'canonical' | 'free' | 'none';

export type LintResult = {
  errors: Finding[];
  warnings: Finding[];
  style: Finding[];
  suggestions: Finding[];
  scores: LintScores;
  layout: LayoutSource;
  executionProfile: ExecutionProfile | 'none';
};

export type LintOptions = {
  /** Layer 2. Default: Camunda 8 / Zeebe. `'none'` skips the profile (no fake 100). */
  executionProfile?: ExecutionProfile | 'none';
  /** Layer 4. Lists can skip canonical-layout comparison because it is CPU-heavy and not displayed there. */
  geometry?: 'check' | 'skip';
  /** Layer 5: warn when gateway count exceeds this. */
  gatewayWarnAt?: number;
};

/** Gateways above this count produce a quality warning. */
export const GATEWAY_WARN_AT = 8;
