import { BpmnImportError, importBpmnXml, MAX_BPMN_IMPORT_BYTES, sniffBpmnXml } from '@bpmn/bpmn-adapter';

export const BPMN_FILE_ACCEPT = '.bpmn,.xml,application/xml,text/xml';

export function looksLikeBpmn(xml: string): boolean {
  return sniffBpmnXml(xml).ok;
}

export async function readBpmnFile(file: File): Promise<string> {
  if (file.size === 0) throw new BpmnImportError('empty', 'The file is empty.');
  if (file.size > MAX_BPMN_IMPORT_BYTES) {
    throw new BpmnImportError('too_large', 'The file is too large to import as BPMN 2.0 XML.');
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new BpmnImportError('unreadable', 'Could not read the file as text.');
  }
  const { xml } = await importBpmnXml(bytes, { filename: file.name });
  return xml;
}
