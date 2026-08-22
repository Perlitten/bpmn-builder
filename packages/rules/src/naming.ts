import type { Finding } from './types.js';

/** Infinitive verbs used for Camunda-style task names (object + action). */
export const ACTION_VERBS = new Set(
  'accept add allocate analyze apply approve archive assign audit book calculate call cancel capture check chase close collect complete compute confirm create decide deliver dispatch email escalate evaluate execute export fetch file generate handle identify import inspect invoice issue match notify open pay pick prepare print process publish quote receive record refund register reject release report request reserve resolve return review route run save schedule select send ship sign submit update upload validate verify wait'.split(
    ' ',
  ),
);

const PAST: Record<string, string> = {
  approve: 'approved',
  check: 'checked',
  create: 'created',
  notify: 'notified',
  process: 'processed',
  receive: 'received',
  reject: 'rejected',
  review: 'reviewed',
  send: 'sent',
  submit: 'submitted',
  validate: 'validated',
  verify: 'verified',
};

const ID_KIND =
  'activity|task|usertask|servicetask|sendtask|receivetask|scripttask|businessruletask|manualtask|callactivity|subprocess|gateway|exclusivegateway|parallelgateway|inclusivegateway|eventbasedgateway|complexgateway|event|startevent|endevent|intermediatecatchevent|intermediatethrowevent|boundaryevent|sequenceflow|flow|participant|lane';

const GENERIC = new Set(
  `${ID_KIND}|start|end|join|split|fork|merge|exclusive gateway|parallel gateway|inclusive gateway|event-based gateway|event based gateway|user task|service task|send task|receive task|script task|business rule task|manual task|call activity|start event|end event|sequence flow`
    .split('|')
    .map((s) => s.toLowerCase().replace(/[\s-]+/g, '')),
);

export type NameNeighbor = {
  id: string;
  type: string;
  name: string;
};

export type NameContext = {
  id: string;
  type: string;
  name: string;
  incoming: NameNeighbor[];
  outgoing: NameNeighbor[];
  source?: NameNeighbor;
  target?: NameNeighbor;
  isDefault?: boolean;
  condition?: string;
  flowIndex?: number;
  sourceOutgoingCount?: number;
};

export type NameSuggestion = {
  name: string;
  reason: string;
};

export function normalizeTaskName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const word0 = words[0]!.toLowerCase().replace(/[^a-z]/g, '');
    const word1 = words[1]!.toLowerCase().replace(/[^a-z]/g, '');
    let verbBase: string | undefined;
    for (const verb of ACTION_VERBS) {
      const inflections = verb.endsWith('e')
        ? [`${verb}s`, `${verb}d`, `${verb.slice(0, -1)}ing`]
        : [`${verb}s`, `${verb}ed`, `${verb}ing`];
      if (inflections.includes(word1)) {
        verbBase = verb;
        break;
      }
    }
    if (verbBase && !ACTION_VERBS.has(word0)) {
      const objectWords = words.slice(2).filter((w) => !/^(a|an|the)$/i.test(w));
      const objectStr = objectWords.join(' ');
      const capitalizedVerb = verbBase.charAt(0).toUpperCase() + verbBase.slice(1);
      return objectStr ? `${capitalizedVerb} ${objectStr.toLowerCase()}` : capitalizedVerb;
    }
  }
  return name;
}

export function hasActionVerb(name: string): boolean {
  const word = name.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
  if (!word) return false;
  if (ACTION_VERBS.has(word)) return true;
  for (const verb of ACTION_VERBS) {
    const inflections = verb.endsWith('e')
      ? [`${verb}s`, `${verb}d`, `${verb.slice(0, -1)}ing`]
      : [`${verb}s`, `${verb}ed`, `${verb}ing`];
    if (inflections.includes(word)) return true;
  }
  return false;
}

/** The English action-verb rule should not grade names written in another script. */
export function shouldCheckActionVerb(name: string): boolean {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return /[a-z]/i.test(first);
}

export function isPlaceholderName(name: string, id?: string): boolean {
  const t = name.trim();
  if (!t) return true;
  if (id && t === id) return true;
  const folded = t.toLowerCase().replace(/[\s-]+/g, '');
  if (GENERIC.has(folded)) return true;
  return new RegExp(`^(?:bpmn:)?(?:${ID_KIND})(?:[_\\-][a-z0-9]+|[0-9]+)$`, 'i').test(folded);
}

export function suggestName(ctx: NameContext, findings: Finding[] = []): NameSuggestion | undefined {
  const current = ctx.name.trim();
  const kind = elementKind(ctx.type);
  const suggestion =
    kind === 'flow'
      ? suggestFlow(ctx, current)
      : kind === 'and' || kind === 'eventBased'
        ? suggestUnlabeled(current, 'Join and parallel gateways stay unlabeled')
        : kind === 'xor' || kind === 'or'
          ? suggestGateway(ctx, current)
          : kind === 'task'
            ? suggestTask(ctx, current, findings)
            : kind === 'event'
              ? suggestEvent(ctx, current)
              : undefined;
  if (!suggestion) return undefined;
  if (suggestion.name === current) return undefined;
  return suggestion;
}

function elementKind(type: string): 'task' | 'event' | 'xor' | 'or' | 'and' | 'eventBased' | 'flow' | 'other' {
  const t = type.replace(/^bpmn:/, '').toLowerCase();
  if (t === 'sequenceflow') return 'flow';
  if (t === 'exclusivegateway') return 'xor';
  if (t === 'inclusivegateway') return 'or';
  if (t === 'parallelgateway') return 'and';
  if (t === 'eventbasedgateway') return 'eventBased';
  if (t.includes('event')) return 'event';
  if (
    t.includes('task') ||
    t === 'task' ||
    t.includes('activity') ||
    t === 'subprocess' ||
    t === 'callactivity'
  ) {
    return 'task';
  }
  return 'other';
}

function suggestGateway(ctx: NameContext, current: string): NameSuggestion | undefined {
  const join = ctx.incoming.length >= 2 && ctx.outgoing.length <= 1;
  if (join) return suggestUnlabeled(current, 'Joining gateways stay unlabeled');
  if (!isPlaceholderName(current, ctx.id) && current.endsWith('?')) return undefined;
  const fromPrev = firstMeaningful(ctx.incoming);
  const seed = fromPrev ?? (current && !isPlaceholderName(current, ctx.id) ? current : 'Validate customer');
  return { name: asQuestion(seed), reason: 'XOR split is a question' };
}

function suggestUnlabeled(current: string, reason: string): NameSuggestion | undefined {
  if (!current) return undefined;
  return { name: '', reason };
}

function suggestFlow(ctx: NameContext, current: string): NameSuggestion | undefined {
  const sourceKind = ctx.source ? elementKind(ctx.source.type) : 'other';
  if (sourceKind !== 'xor' && sourceKind !== 'or') return undefined;
  if ((ctx.sourceOutgoingCount ?? 0) < 2) return undefined;
  const index = ctx.flowIndex ?? 0;
  const yes = ctx.isDefault || index === 0 || looksYes(ctx.condition);
  const proposed = yes ? 'Yes' : index > 1 ? 'Otherwise' : 'No';
  if (current && current.toLowerCase() === proposed.toLowerCase()) return undefined;
  return { name: proposed, reason: 'XOR flows are answers' };
}

function suggestTask(ctx: NameContext, current: string, findings: Finding[]): NameSuggestion | undefined {
  const fromNext = stripQuestion(firstMeaningful(ctx.outgoing));
  const fromPrev = firstMeaningful(ctx.incoming);
  if (isPlaceholderName(current, ctx.id)) {
    const proposed = asTask(fromNext || fromPrev || 'Validate customer');
    return { name: proposed, reason: 'Task names are object + action' };
  }
  if (findings.some((f) => f.id === 'style.task-verb') || !hasActionVerb(current)) {
    const proposed = asTask(current);
    if (proposed === current) return undefined;
    return { name: proposed, reason: 'Task names are object + action' };
  }
  const words = current.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    const proposed = asTask(current);
    if (proposed === current) return undefined;
    return { name: proposed, reason: 'Task names are object + action' };
  }
  return undefined;
}

function suggestEvent(ctx: NameContext, current: string): NameSuggestion | undefined {
  const t = ctx.type.replace(/^bpmn:/, '').toLowerCase();
  const start = t.includes('start');
  const end = t.includes('end');
  if (!isPlaceholderName(current, ctx.id) && looksLikeState(current)) return undefined;
  const neighbor = firstMeaningful(start ? ctx.outgoing : ctx.incoming);
  const proposed = start ? asStartState(neighbor) : end ? asEndState(neighbor) : asEndState(neighbor);
  if (proposed === current) return undefined;
  return { name: proposed, reason: 'Events name a business state' };
}

function firstMeaningful(nodes: NameNeighbor[]): string | undefined {
  for (const node of nodes) {
    const name = node.name.trim();
    if (name && !isPlaceholderName(name, node.id)) return name;
  }
  return undefined;
}

function asQuestion(label: string): string {
  const base = sentenceCase(stripQuestion(label));
  return base ? `${base}?` : 'Validate customer?';
}

function asTask(label: string): string {
  const base = sentenceCase(stripQuestion(label));
  if (!base) return 'Validate customer';
  if (isPlaceholderName(base)) return 'Validate customer';
  const normalized = normalizeTaskName(base);
  if (normalized !== base) return normalized;
  const words = base.split(/\s+/);
  if (words.length === 1) {
    return hasActionVerb(words[0]) ? `${capitalize(words[0].toLowerCase())} request` : `Check ${words[0].toLowerCase()}`;
  }
  if (!hasActionVerb(base)) return `Check ${base.toLowerCase()}`;
  return base;
}

function asStartState(taskName: string | undefined): string {
  if (!taskName) return 'Request received';
  const object = objectOf(taskName);
  return sentenceCase(`${object} received`);
}

function asEndState(taskName: string | undefined): string {
  if (!taskName) return 'Request completed';
  const words = stripQuestion(taskName).split(/\s+/).filter(Boolean);
  if (words.length >= 2 && hasActionVerb(words[0])) {
    const verb = words[0].toLowerCase().replace(/[^a-z]/g, '');
    const object = words.slice(1).join(' ');
    const past = PAST[verb] ?? (verb.endsWith('e') ? `${verb}d` : `${verb}ed`);
    return sentenceCase(`${object} ${past}`);
  }
  return sentenceCase(`${objectOf(taskName)} completed`);
}

function objectOf(label: string): string {
  const words = stripQuestion(label).split(/\s+/).filter(Boolean);
  if (words.length >= 2 && hasActionVerb(words[0])) return words.slice(1).join(' ');
  return words.join(' ') || 'request';
}

function looksLikeState(name: string): boolean {
  return /\b(received|completed|validated|approved|rejected|confirmed|failed|cancelled|canceled)\b/i.test(name);
}

function looksYes(condition: string | undefined): boolean {
  return !!condition && /\b(yes|true|ok|approved)\b/i.test(condition);
}

function stripQuestion(label: string | undefined): string {
  const trimmed = (label ?? '').trim();
  let end = trimmed.length;
  while (end > 0 && trimmed.charCodeAt(end - 1) === 63) end -= 1;
  return trimmed.slice(0, end).trimEnd();
}

function sentenceCase(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return [capitalize(words[0].toLowerCase()), ...words.slice(1).map((w) => w.toLowerCase())].join(' ');
}

function capitalize(word: string): string {
  return word ? word[0].toUpperCase() + word.slice(1) : word;
}
