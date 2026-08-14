/** Safe download filename from a process name. XML stays the interchange, not the editing model. */

const UNSAFE = /[<>:"/\\|?*\u0000-\u001f]/g;
const KNOWN_EXT = /\.(bpmn|svg|pdf)$/i;

export function downloadStem(name: string): string {
  const cleaned =
    name
      .trim()
      .replace(UNSAFE, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'process';
  return cleaned.replace(KNOWN_EXT, '') || 'process';
}

export function downloadFilename(name: string, ext: string): string {
  return `${downloadStem(name)}.${ext.replace(/^\./, '').toLowerCase()}`;
}

export function bpmnDownloadFilename(name: string): string {
  return downloadFilename(name, 'bpmn');
}

export function downloadBlob(data: Blob, filename: string): void {
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(text: string, filename: string, mime: string): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

export function downloadBpmnXml(xml: string, filename: string): void {
  downloadText(xml, filename, 'application/xml;charset=utf-8');
}
