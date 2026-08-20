import {
  addTask,
  createProcess,
  splitExclusive,
  splitParallel,
  type Process,
} from '@bpmn/semantic-core';
import { exportProcessXml } from '@bpmn/bpmn-adapter';
import {
  cleanTaskName,
  DescriptionParseError,
  linearSemanticProcess,
  linearSteps,
  MAX_GENERATED_STEPS,
  validateDescriptionText,
} from './linearProcess';

type ExclusiveBranch = { name: string; tasks: string[] };

export type ExclusiveDecision = {
  prefix: string;
  name: string;
  branches: [ExclusiveBranch, ExclusiveBranch];
};

export type ParallelDecision = {
  prefix: string;
  branches: string[][];
};

const LOOP_PATTERN =
  /\b(?:go\s+back\s+to|loop\s+back|repeat\s+until|repeat\s+from|return\s+to\s+step|верн(?:уться|итесь)\s+к|повтор(?:ять|яйте)\s+до|zurück\s+zu|wiederholen\s+bis)\b/iu;
const PARALLEL_PATTERN =
  /(?:,\s*|\s+)(?:meanwhile|at\s+the\s+same\s+time|in\s+parallel|одновременно|параллельно|gleichzeitig|parallel\s+dazu)(?:,\s*|\s+)|(?:与此同时|同时)/iu;

const CONDITIONAL_IF_PATTERN =
  /(?:(?:if|если|wenn|falls|si)(?=[^\p{L}\p{N}_]|$)|s['’]ils?(?=[^\p{L}\p{N}_]|$)|如果)/iu;
const CONDITIONAL_THEN_PATTERN = /(?:then|тогда|dann|alors)/iu;
const CONDITIONAL_OTHERWISE_PATTERN =
  /(?:(?:otherwise|else|иначе|в\s+противном\s+случае|sonst|ansonsten|sinon)(?=[^\p{L}\p{N}_]|$)|否则)/iu;
const CONDITIONAL_LABEL_PATTERN = /(?:passed|прошла|пройдена|успешно|yes|да)\s*:/iu;

function shortName(condition: string): string {
  const core = condition.replace(/^(?:the|a|an)\s+/i, '').replace(/\s+/g, ' ').trim();
  if (!core) return 'Yes';
  let clipped = core;
  if (core.length > 32) {
    const sliced = core.slice(0, 29);
    const wordBoundary = sliced.replace(/\s+\S*$/u, '').trim();
    const base = wordBoundary || sliced.trim();
    clipped = `${base.replace(/[.,;:!?—-]+$/u, '')}…`;
  }
  return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}

function questionName(condition: string): string {
  const core = shortName(condition).replace(/\?+$/, '');
  return core ? `${core}?` : 'Decision';
}

function pairKind(condition: string): 'passed' | 'failed' | 'yes' | 'no' | null {
  let value = condition.trim().toLowerCase().replace(/\s+/g, ' ');
  value = value.replace(/^(?:the|a|an|it)\s+/, '');
  value = value.replace(/^(?:check|kyc|screening|verification)\s+/, '');
  if (
    value === 'failed' ||
    value.endsWith(' failed') ||
    value.includes('не прошла') ||
    value.includes('не пройдена') ||
    value.includes('неуспешно')
  ) {
    return 'failed';
  }
  if (
    value === 'passed' ||
    value.endsWith(' passed') ||
    value === 'прошла' ||
    value === 'пройдена' ||
    value === 'успешно' ||
    value.endsWith(' прошла') ||
    value.endsWith(' пройдена') ||
    value.endsWith(' успешно')
  ) {
    return 'passed';
  }
  if (value === 'yes' || value === 'да') return 'yes';
  if (value === 'no' || value === 'нет') return 'no';
  return null;
}

function clauseOffsets(text: string, needle: RegExp): number[] {
  const re = new RegExp(
    `(?:^|[.!?;,\\n\\u3002\\uFF0C\\uFF01\\uFF1F\\uFF1B]\\s*)(${needle.source})`,
    needle.flags.includes('i') ? 'giu' : 'gu',
  );
  const offsets: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const token = match[1];
    if (!token) continue;
    offsets.push(match.index + match[0].length - token.length);
  }
  return offsets;
}

function branchTasks(text: string): string[] {
  const cleaned = cleanTaskName(text);
  if (!cleaned) return [];
  return linearSteps(cleaned);
}

function twoBranches(
  name: string,
  aName: string,
  aTask: string,
  bName: string,
  bTask: string,
): Omit<ExclusiveDecision, 'prefix'> {
  return {
    name,
    branches: [
      { name: aName, tasks: branchTasks(aTask) },
      { name: bName, tasks: bTask.trim() ? branchTasks(bTask) : [] },
    ],
  };
}

function fromCondition(
  condition: string,
  aTask: string,
  bTask: string,
  otherwise: boolean,
): Omit<ExclusiveDecision, 'prefix'> {
  const kind = pairKind(condition);
  if (kind === 'passed') {
    return twoBranches('Passed?', 'Passed', aTask, otherwise ? 'Otherwise' : 'Failed', bTask);
  }
  if (kind === 'yes') {
    return twoBranches('Yes?', 'Yes', aTask, otherwise ? 'Otherwise' : 'No', bTask);
  }
  return twoBranches(questionName(condition), shortName(condition), aTask, 'Otherwise', bTask);
}

function fromPair(c1: string, t1: string, c2: string, t2: string): Omit<ExclusiveDecision, 'prefix'> | null {
  const a = pairKind(c1);
  const b = pairKind(c2);
  if (a === 'passed' && b === 'failed') return twoBranches('Passed?', 'Passed', t1, 'Failed', t2);
  if (a === 'yes' && b === 'no') return twoBranches('Yes?', 'Yes', t1, 'No', t2);
  return null;
}

type IfClause = { condition: string; body: string };

function splitIfClause(text: string): IfClause | null {
  const thenPattern = CONDITIONAL_THEN_PATTERN.source;
  const splitRegex = new RegExp(
    '^(?:' +
      CONDITIONAL_IF_PATTERN.source +
      ')(?:\\s+|(?:(?<=[如果])|(?=[如果])))' +
      '(.+?)' +
      '(?:' +
      '\\s+' +
      thenPattern +
      '\\s+|' +
      '\\s*[:,—,\\uFF0C\\uFF1A]\\s*(?:' +
      thenPattern +
      '\\s+)?|' +
      '\\s+-\\s+(?:' +
      thenPattern +
      '\\s+)?' +
      ')' +
      '([\\s\\S]+)$',
    'iu',
  );
  const match = text.match(splitRegex);
  if (!match) return null;
  const condition = cleanTaskName(match[1] ?? '');
  const body = (match[2] ?? '').trim();
  return condition && body ? { condition, body } : null;
}

function otherwiseOffsets(text: string): number[] {
  return clauseOffsets(text, CONDITIONAL_OTHERWISE_PATTERN);
}

function parseIfDecision(rest: string): Omit<ExclusiveDecision, 'prefix'> | null {
  const first = splitIfClause(rest);
  if (!first) return null;

  const otherwise = otherwiseOffsets(first.body);
  if (otherwise.length > 1) {
    throw new DescriptionParseError(
      'Multiple “otherwise/else” clauses are ambiguous. Use one condition per process description.',
    );
  }
  if (otherwise.length === 1) {
    const at = otherwise[0]!;
    const falseBody = first.body.slice(at).replace(
      new RegExp(
        '^(?:' +
          CONDITIONAL_OTHERWISE_PATTERN.source +
          ')\\s*(?:(?:' +
          CONDITIONAL_THEN_PATTERN.source +
          ')\\s+)?',
        'iu',
      ),
      '',
    );
    const trueBody = first.body
      .slice(0, at)
      .replace(/[.!?;,\s\u3002\uFF0C\uFF01\uFF1F\uFF1B]+$/u, '');
    if (new RegExp('^(?:' + CONDITIONAL_IF_PATTERN.source + ')', 'iu').test(falseBody.trim())) {
      throw new DescriptionParseError(
        'Nested conditions are not generated automatically yet. Describe one decision at a time.',
      );
    }
    return fromCondition(first.condition, trueBody, falseBody, true);
  }

  const nestedIf = clauseOffsets(first.body, CONDITIONAL_IF_PATTERN);
  if (nestedIf.length) {
    const at = nestedIf[0]!;
    const second = splitIfClause(first.body.slice(at));
    const firstBody = first.body.slice(0, at).replace(/[.!?;,\s]+$/u, '');
    if (second) {
      const pair = fromPair(first.condition, firstBody, second.condition, second.body);
      if (pair) return pair;
    }
    throw new DescriptionParseError(
      'Nested conditions are not generated automatically yet. Describe one decision at a time.',
    );
  }

  return fromCondition(first.condition, first.body, '', false);
}

function parseLabelDecision(rest: string): Omit<ExclusiveDecision, 'prefix'> | null {
  const passed = rest.match(/^(?:passed|прошла|пройдена|успешно)\s*:\s*(.+?)(?:\s*[.!?;]\s*)(?:failed|не прошла|не пройдена|неуспешно)\s*:\s*(.+?)\s*$/isu);
  if (passed) return twoBranches('Passed?', 'Passed', passed[1]!, 'Failed', passed[2]!);
  const yesNo = rest.match(/^(?:yes|да)\s*:\s*(.+?)(?:\s*[.!?;]\s*)(?:no|нет)\s*:\s*(.+?)\s*$/isu);
  if (!yesNo) return null;
  return twoBranches('Yes?', 'Yes', yesNo[1]!, 'No', yesNo[2]!);
}

/** Sentence-level if/otherwise, passed/failed, or yes/no — not “or” in prose. */
export function detectExclusiveDecision(text: string): ExclusiveDecision | null {
  const trimmed = validateDescriptionText(text);
  const ifOffsets = clauseOffsets(trimmed, CONDITIONAL_IF_PATTERN);
  if (ifOffsets.length > 2) {
    throw new DescriptionParseError(
      'Multiple decisions are not generated automatically yet. Describe one decision at a time.',
    );
  }
  for (const at of ifOffsets) {
    const parsed = parseIfDecision(trimmed.slice(at));
    if (parsed) return { prefix: trimmed.slice(0, at), ...parsed };
  }
  for (const at of clauseOffsets(trimmed, CONDITIONAL_LABEL_PATTERN)) {
    const parsed = parseLabelDecision(trimmed.slice(at));
    if (parsed) return { prefix: trimmed.slice(0, at), ...parsed };
  }
  return null;
}

export function detectParallelDecision(text: string): ParallelDecision | null {
  const trimmed = validateDescriptionText(text);
  if (!PARALLEL_PATTERN.test(trimmed)) return null;

  const sentenceStart = Math.max(
    trimmed.lastIndexOf('. '),
    trimmed.lastIndexOf('! '),
    trimmed.lastIndexOf('? '),
    trimmed.lastIndexOf('。'),
  );
  const prefix = sentenceStart >= 0 ? trimmed.slice(0, sentenceStart + 1) : '';
  const parallelText = sentenceStart >= 0 ? trimmed.slice(sentenceStart + 1).trim() : trimmed;
  const branches = parallelText
    .split(new RegExp(PARALLEL_PATTERN.source, 'giu'))
    .map((part) => cleanTaskName(part))
    .filter(Boolean)
    .map((part) => linearSteps(part));
  if (branches.length < 2) return null;
  return { prefix, branches };
}

function prefixTasks(prefix: string): string[] {
  const cleaned = cleanTaskName(prefix);
  return cleaned ? linearSteps(cleaned) : [];
}

function assertStepCount(count: number): void {
  if (count > MAX_GENERATED_STEPS) {
    throw new DescriptionParseError(
      `This description contains ${count} steps. The generator supports up to ${MAX_GENERATED_STEPS}; split it into smaller processes.`,
    );
  }
}

function assertExclusiveSize(decision: ExclusiveDecision): void {
  assertStepCount(
    prefixTasks(decision.prefix).length +
      decision.branches.reduce((total, branch) => total + branch.tasks.length, 0),
  );
}

function assertParallelSize(decision: ParallelDecision): void {
  assertStepCount(
    prefixTasks(decision.prefix).length + decision.branches.reduce((total, branch) => total + branch.length, 0),
  );
}

function buildExclusive(name: string, decision: ExclusiveDecision): Process {
  assertExclusiveSize(decision);
  let process = createProcess({ name });
  let after = 'StartEvent_1';
  for (const step of prefixTasks(decision.prefix)) {
    const added = addTask(process, { name: step, after });
    process = added.process;
    after = added.id;
  }
  process = splitExclusive(process, {
    after,
    name: decision.name,
    branches: decision.branches.map((branch) => ({ name: branch.name })),
  }).process;
  const [left, right] = process.regions[0]!.branches;
  for (const task of decision.branches[0].tasks) {
    process = addTask(process, { name: task, branchId: left!.id }).process;
  }
  for (const task of decision.branches[1].tasks) {
    process = addTask(process, { name: task, branchId: right!.id }).process;
  }
  return process;
}

function buildParallel(name: string, decision: ParallelDecision): Process {
  assertParallelSize(decision);
  let process = createProcess({ name });
  let after = 'StartEvent_1';
  for (const step of prefixTasks(decision.prefix)) {
    const added = addTask(process, { name: step, after });
    process = added.process;
    after = added.id;
  }
  process = splitParallel(process, {
    after,
    branches: decision.branches.map(() => ({ name: '' })),
  }).process;
  const branches = process.regions[0]!.branches;
  for (const [index, tasks] of decision.branches.entries()) {
    for (const task of tasks) {
      process = addTask(process, { name: task, branchId: branches[index]!.id }).process;
    }
  }
  return process;
}

function assertSupportedDescription(text: string): void {
  if (LOOP_PATTERN.test(text)) {
    throw new DescriptionParseError(
      'Loops are not generated automatically yet. Create the process, then add the return flow in the editor.',
    );
  }
}

export function descriptionInputIssue(text: string): string | null {
  if (!text.trim()) return null;
  try {
    validateDescriptionText(text);
    assertSupportedDescription(text);
    const exclusive = detectExclusiveDecision(text);
    const parallel = detectParallelDecision(text);
    if (exclusive && parallel) {
      throw new DescriptionParseError(
        'A decision and parallel work in the same sentence are ambiguous. Describe them separately.',
      );
    }
    if (exclusive) assertExclusiveSize(exclusive);
    else if (parallel) assertParallelSize(parallel);
    else linearSteps(text);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Could not understand this description.';
  }
}

export function describeSemanticProcess(name: string, description: string): Process {
  const trimmed = validateDescriptionText(description);
  assertSupportedDescription(trimmed);
  const exclusive = detectExclusiveDecision(trimmed);
  const parallel = detectParallelDecision(trimmed);
  if (exclusive && parallel) {
    throw new DescriptionParseError(
      'A decision and parallel work in the same sentence are ambiguous. Describe them separately.',
    );
  }
  if (exclusive) return buildExclusive(name, exclusive);
  if (parallel) return buildParallel(name, parallel);
  return linearSemanticProcess(name, trimmed);
}

/** Start → tasks → End, XOR, or AND via semantic-core and canonical layout. */
export function describeBpmnXml(name: string, description: string): string {
  return exportProcessXml(describeSemanticProcess(name, description));
}
