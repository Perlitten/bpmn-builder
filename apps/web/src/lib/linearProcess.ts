import { addTask, createProcess, type Process } from '@bpmn/semantic-core';
import { exportProcessXml } from '@bpmn/bpmn-adapter';

export const MAX_DESCRIPTION_CHARS = 20_000;
export const MAX_GENERATED_STEPS = 200;

const SEQUENCE_WORDS = new Set([
  'afterwards',
  'danach',
  'dann',
  'далее',
  'затем',
  'потом',
  'ensuite',
  'luego',
  'next',
  'puis',
]);
const NON_SEQUENTIAL_THEN_PREFIXES = new Set(['back', 'by', 'since', 'until']);
const ABBREVIATIONS = new Set(['dr', 'e.g', 'i.e', 'mr', 'mrs', 'ms', 'prof', 'sr', 'st', 'vs']);

export class DescriptionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DescriptionParseError';
  }
}

export function validateDescriptionText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new DescriptionParseError('Describe at least one process step.');
  if (trimmed.length > MAX_DESCRIPTION_CHARS) {
    throw new DescriptionParseError(
      `Description is too long (${trimmed.length.toLocaleString()} characters). The limit is ${MAX_DESCRIPTION_CHARS.toLocaleString()}.`,
    );
  }
  if (!/[\p{L}\p{N}]/u.test(trimmed)) {
    throw new DescriptionParseError('Use words or numbers so the process steps can be named.');
  }
  return trimmed;
}

export function cleanTaskName(text: string): string {
  return text
    .replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '')
    .replace(/^\s*(?:(?:and\s+)?then|next|afterwards|затем|потом|далее|dann|danach|puis|ensuite|luego)\s+/iu, '')
    .replace(/[.!?。！？;,；]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentenceBoundaries(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  const boundary = /[.!?。！？]+\s+/gu;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(text))) {
    const before = text.slice(start, match.index + match[0].trimEnd().length);
    const token = before.match(/([\p{L}.]+)[.!?。！？]+$/u)?.[1]?.toLowerCase() ?? '';
    if (ABBREVIATIONS.has(token)) continue;
    parts.push(text.slice(start, match.index + match[0].trimEnd().length));
    start = match.index + match[0].length;
  }
  parts.push(text.slice(start));
  return parts;
}

function markSequentialThen(text: string): string {
  const matches = [...text.matchAll(/\bthen\b/giu)];
  if (!matches.length) return text;
  let out = '';
  let from = 0;
  for (const match of matches) {
    const at = match.index ?? 0;
    const before = text.slice(0, at).match(/([\p{L}]+)\s*$/u)?.[1]?.toLowerCase() ?? '';
    const after = text.slice(at + match[0].length).match(/^\s*([\p{L}]+)/u)?.[1]?.toLowerCase() ?? '';
    const sequential = !NON_SEQUENTIAL_THEN_PREFIXES.has(before) && after !== 'some';
    out += text.slice(from, at) + (sequential ? '\u0000' : match[0]);
    from = at + match[0].length;
  }
  return out + text.slice(from);
}

function splitLine(line: string): string[] {
  const markedThen = markSequentialThen(line);
  const markedConnectors = markedThen.replace(
    /(?:,\s*|\s+)(afterwards|danach|dann|далее|затем|потом|ensuite|luego|next|puis)(?=\s+)/giu,
    (_match, connector: string) => (SEQUENCE_WORDS.has(connector.toLowerCase()) ? '\u0000' : _match),
  );
  const markedCjk = markedConnectors.replace(/(?:然后|接着|随后)/gu, '\u0000');
  return markedCjk.split(/\s*(?:\u0000|[;；])\s*/u);
}

/**
 * Deterministic, bounded prose-to-task segmentation. It never truncates: input
 * over the supported task count is rejected with an actionable error.
 */
export function linearSteps(text: string): string[] {
  const trimmed = validateDescriptionText(text);
  const raw: string[] = [];
  for (const line of trimmed.split(/\r?\n+/u)) {
    const withoutMarker = line.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '').trim();
    if (!withoutMarker) continue;
    for (const sentence of splitSentenceBoundaries(withoutMarker)) {
      raw.push(...splitLine(sentence));
    }
  }

  const steps = raw.map(cleanTaskName).filter(Boolean);
  if (steps.length > MAX_GENERATED_STEPS) {
    throw new DescriptionParseError(
      `This description contains ${steps.length} steps. The generator supports up to ${MAX_GENERATED_STEPS}; split it into smaller processes.`,
    );
  }
  if (!steps.length) throw new DescriptionParseError('No process steps could be identified.');
  return steps;
}

export function linearSemanticProcess(name: string, description: string): Process {
  let process = createProcess({ name });
  for (const step of linearSteps(description)) {
    process = addTask(process, { name: step }).process;
  }
  return process;
}

/** Start → tasks → End XML via semantic-core + layout. Does not parse XOR / AND / OR. */
export function linearBpmnXml(name: string, description: string): string {
  return exportProcessXml(linearSemanticProcess(name, description));
}
