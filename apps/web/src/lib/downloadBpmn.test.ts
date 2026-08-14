import { afterEach, describe, expect, it, vi } from 'vitest';
import { bpmnDownloadFilename, downloadFilename, downloadStem, downloadText } from './downloadBpmn';

describe('download filenames', () => {
  it('appends .bpmn to a process name', () => {
    expect(bpmnDownloadFilename('Onboarding')).toBe('Onboarding.bpmn');
  });

  it('does not double the extension', () => {
    expect(bpmnDownloadFilename('claim.bpmn')).toBe('claim.bpmn');
  });

  it('strips path characters and falls back when empty', () => {
    expect(bpmnDownloadFilename('a/b:c')).toBe('a-b-c.bpmn');
    expect(bpmnDownloadFilename('   ')).toBe('process.bpmn');
  });

  it('uses the same stem for SVG and PDF', () => {
    expect(downloadStem('Claim review')).toBe('Claim-review');
    expect(downloadFilename('Claim review', 'svg')).toBe('Claim-review.svg');
    expect(downloadFilename('Claim review.bpmn', 'pdf')).toBe('Claim-review.pdf');
  });
});

describe('downloadText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clicks a download link for SVG markup', () => {
    const clicks: string[] = [];
    const appended: unknown[] = [];
    const link = {
      href: '',
      download: '',
      rel: '',
      click() {
        clicks.push(this.download);
      },
      remove() {},
    };
    vi.stubGlobal('document', {
      createElement: () => link,
      body: { append: (node: unknown) => appended.push(node) },
    });
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:diagram',
      revokeObjectURL: () => {},
    });

    downloadText('<svg viewBox="0 0 10 10"/>', 'Onboarding.svg', 'image/svg+xml;charset=utf-8');

    expect(link.download).toBe('Onboarding.svg');
    expect(link.href).toBe('blob:diagram');
    expect(link.rel).toBe('noopener');
    expect(clicks).toEqual(['Onboarding.svg']);
    expect(appended).toHaveLength(1);
  });
});
