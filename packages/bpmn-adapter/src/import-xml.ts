import { stripXmlComments, type Process } from '../../semantic-core/src/index.js';
import { xmlToProcess } from './semantic-xml.js';

/** OMG BPMN 2.0.2 semantic namespace. */
export const BPMN_20_MODEL_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
export const BPMN_20_NS = BPMN_20_MODEL_NS;
export const MAX_BPMN_IMPORT_BYTES = 8 * 1024 * 1024;

export type BpmnImportCode =
  | 'empty'
  | 'unreadable'
  | 'too_large'
  | 'binary'
  | 'archive'
  | 'html'
  | 'json'
  | 'not_xml'
  | 'bpmn_1x'
  | 'not_bpmn_20'
  | 'no_definitions'
  | 'no_process'
  | 'no_flow_nodes'
  | 'parse_error';

export class BpmnImportError extends Error {
  readonly code: BpmnImportCode;

  constructor(code: BpmnImportCode, message: string) {
    super(message);
    this.name = 'BpmnImportError';
    this.code = code;
  }
}

export type BpmnSniffResult =
  | { ok: true; xml: string }
  | { ok: false; code: BpmnImportCode; message: string };

const MSG = {
  empty: 'The file is empty.',
  tooLarge: 'The file is too large to import as BPMN 2.0 XML.',
  binary: 'This file looks like binary data, not BPMN 2.0 XML.',
  archive: 'This looks like a zip or Office file, not BPMN 2.0 XML.',
  spreadsheet: 'This looks like a spreadsheet, not BPMN 2.0 XML.',
  zip: 'This looks like a zip archive, not BPMN 2.0 XML.',
  html: 'This is HTML, not BPMN 2.0 XML.',
  json: 'This is JSON, not BPMN 2.0 XML.',
  notXml: 'This is not XML, so it is not BPMN 2.0.',
  bpmn1: 'This looks like BPMN 1.x or XPDL, not BPMN 2.0 XML.',
  notBpmn20: 'This is not BPMN 2.0 XML.',
  noDefinitions: 'This XML has no BPMN 2.0 definitions element.',
  noProcess: 'This BPMN 2.0 file has no process or collaboration we can import.',
  noFlow: 'This BPMN file has no start or flow nodes we can import.',
  unreadable: 'Could not read the file as text.',
} as const;

const BPMN_1X_NS = /https?:\/\/(?:www\.)?omg\.org\/spec\/BPMN\/(?:1(?:\.[\d.]+)?(?=[/"'\s>]|$)|20100501)/i;
const XPDL_NS = /wfmc\.org\/[^"'<>]*xpdl/i;
const HTML_ROOT = /^(?:<!DOCTYPE\s+html\b|<html\b|<head\b|<body\b|<script\b)/i;
const PROCESS_OR_COLLAB = /<(?:[\w.-]+:)?(?:process|collaboration)\b/i;
const CONVENTIONAL = new Set(['bpmn', 'bpmn2', 'semantic']);

function fail(code: BpmnImportCode, message: string): BpmnSniffResult {
  return { ok: false, code, message };
}

function archiveMessage(filename?: string): string {
  if (filename && /\.xlsx?$/i.test(filename)) return MSG.spreadsheet;
  if (filename && /\.zip$/i.test(filename)) return MSG.zip;
  return MSG.archive;
}

function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  );
}

function isOle(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 512);
  let ctrl = 0;
  for (let i = 0; i < n; i += 1) {
    const b = bytes[i]!;
    if (b === 0) return true;
    if (b < 9 || (b > 13 && b < 32)) ctrl += 1;
  }
  return n > 32 && ctrl / n > 0.15;
}

function decodeBytes(bytes: Uint8Array): BpmnSniffResult {
  if (bytes.byteLength === 0) return fail('empty', MSG.empty);
  if (bytes.byteLength > MAX_BPMN_IMPORT_BYTES) return fail('too_large', MSG.tooLarge);
  if (isZip(bytes) || isOle(bytes)) return fail('archive', MSG.archive);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { ok: true, xml: new TextDecoder('utf-16le').decode(bytes.subarray(2)) };
  }
  if (looksBinary(bytes)) return fail('binary', MSG.binary);
  try {
    return { ok: true, xml: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '') };
  } catch {
    return fail('unreadable', MSG.unreadable);
  }
}

function skipPreamble(xml: string): string {
  let text = xml.replace(/^\uFEFF/, '').trimStart();
  for (;;) {
    if (text.startsWith('<?xml')) {
      const end = text.indexOf('?>');
      if (end < 0) return text;
      text = text.slice(end + 2).trimStart();
      continue;
    }
    if (text.startsWith('<!--')) {
      const end = text.indexOf('-->');
      if (end < 0) return text;
      text = text.slice(end + 3).trimStart();
      continue;
    }
    if (text.startsWith('<!DOCTYPE') && !/^<!DOCTYPE\s+html\b/i.test(text)) {
      const end = text.indexOf('>');
      if (end < 0) return text;
      text = text.slice(end + 1).trimStart();
      continue;
    }
    return text;
  }
}

function rootOpenTag(xml: string): string | null {
  if (!xml.startsWith('<')) return null;
  const end = xml.indexOf('>');
  if (end < 0) return null;
  return xml.slice(0, end + 1);
}

function tagName(open: string): { prefix: string; local: string } {
  const match = open.match(/^<\/?((?:[\w.-]+:)?[\w.-]+)/);
  if (!match) return { prefix: '', local: '' };
  const raw = match[1]!;
  const colon = raw.indexOf(':');
  if (colon < 0) return { prefix: '', local: raw.toLowerCase() };
  return { prefix: raw.slice(0, colon).toLowerCase(), local: raw.slice(colon + 1).toLowerCase() };
}

function xmlnsMap(open: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /xmlns(?::([\w.-]+))?\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(open))) {
    out.set((match[1] ?? '').toLowerCase(), match[2] ?? match[3] ?? '');
  }
  return out;
}

function isBpmn20Root(open: string): boolean {
  const { prefix } = tagName(open);
  const ns = xmlnsMap(open);
  const declared = ns.get(prefix);
  if (declared && (BPMN_1X_NS.test(declared) || XPDL_NS.test(declared))) return false;
  if (declared === BPMN_20_MODEL_NS) return true;
  if ([...ns.values()].some((namespace) => namespace === BPMN_20_MODEL_NS)) return true;
  return !declared && CONVENTIONAL.has(prefix);
}

function sniffStructure(xml: string): BpmnSniffResult {
  const trimmed = xml.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return fail('empty', MSG.empty);
  if (trimmed.length > MAX_BPMN_IMPORT_BYTES) return fail('too_large', MSG.tooLarge);
  const body = skipPreamble(trimmed);
  if (!body) return fail('empty', MSG.empty);
  if (body.startsWith('{') || body.startsWith('[')) return fail('json', MSG.json);
  if (HTML_ROOT.test(body)) return fail('html', MSG.html);
  if (!body.startsWith('<')) return fail('not_xml', MSG.notXml);

  const open = rootOpenTag(body);
  if (!open) return fail('not_xml', MSG.notXml);
  const { local } = tagName(open);
  if (local === 'html' || local === 'head' || local === 'body') return fail('html', MSG.html);
  if (BPMN_1X_NS.test(body) || XPDL_NS.test(body)) return fail('bpmn_1x', MSG.bpmn1);
  if (local !== 'definitions') return fail('no_definitions', MSG.noDefinitions);
  if (!isBpmn20Root(open)) return fail('not_bpmn_20', MSG.notBpmn20);
  if (!PROCESS_OR_COLLAB.test(stripXmlComments(body))) return fail('no_process', MSG.noProcess);
  return { ok: true, xml };
}

/** Fast reject: BPMN 2.0 XML with a process or mappable collaboration. No moddle. */
export function sniffBpmnXml(source: string | Uint8Array, options?: { filename?: string }): BpmnSniffResult {
  const decoded = typeof source === 'string' ? { ok: true as const, xml: source } : decodeBytes(source);
  if (!decoded.ok) {
    if (decoded.code === 'archive') return fail('archive', archiveMessage(options?.filename));
    return decoded;
  }
  return sniffStructure(decoded.xml);
}

export function bpmnXmlShapeError(xml: string): string | null {
  const sniffed = sniffBpmnXml(xml);
  return sniffed.ok ? null : sniffed.message;
}

function hasFlowNodes(process: Process): boolean {
  return process.nodes.length > 0 || process.processes.some((peer) => peer.nodes.length > 0);
}

function parseErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const line = raw.split('\n').map((part) => part.trim()).find(Boolean) ?? '';
  return line ? `Could not parse BPMN 2.0 XML: ${line}` : 'Could not parse BPMN 2.0 XML.';
}

/**
 * Sniff, then parse with the adapter. Throws {@link BpmnImportError}; does not apply broken XML.
 * Imported DI is ignored later — this only requires a semantic graph with flow nodes.
 */
export async function importBpmnXml(
  source: string | Uint8Array,
  options?: { filename?: string },
): Promise<{ xml: string; process: Process }> {
  const sniffed = sniffBpmnXml(source, options);
  if (!sniffed.ok) throw new BpmnImportError(sniffed.code, sniffed.message);
  let process: Process;
  try {
    process = await xmlToProcess(sniffed.xml);
  } catch (err) {
    throw new BpmnImportError('parse_error', parseErrorMessage(err));
  }
  if (!hasFlowNodes(process)) throw new BpmnImportError('no_flow_nodes', MSG.noFlow);
  return { xml: sniffed.xml, process };
}
