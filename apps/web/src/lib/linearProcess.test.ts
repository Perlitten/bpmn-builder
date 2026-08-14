import { describe, expect, it } from 'vitest';
import {
  DescriptionParseError,
  linearBpmnXml,
  linearSteps,
  MAX_DESCRIPTION_CHARS,
  MAX_GENERATED_STEPS,
} from './linearProcess';
import { previewBpmn } from './bpmnPreview';

describe('linearSteps', () => {
  it('keeps a single prose sentence as the task instead of replacing it with a placeholder', () => {
    expect(linearSteps('Ship it')).toEqual(['Ship it']);
    expect(linearSteps('Hire a candidate: offer or reject.')).toEqual(['Hire a candidate: offer or reject']);
  });

  it('splits lists, safe sequence words, sentences, and semicolons into cleaned tasks', () => {
    expect(linearSteps('Receive\nScreen\nInterview')).toEqual(['Receive', 'Screen', 'Interview']);
    expect(linearSteps('Receive, then screen; interview. Archive')).toEqual([
      'Receive',
      'screen',
      'interview',
      'Archive',
    ]);
    expect(linearSteps('1. Receive form\n2) Review form\n- Close case')).toEqual([
      'Receive form',
      'Review form',
      'Close case',
    ]);
  });

  it('supports common non-English sequence connectors', () => {
    expect(linearSteps('Соберите документы, затем проверьте их, затем отправьте')).toEqual([
      'Соберите документы',
      'проверьте их',
      'отправьте',
    ]);
    expect(linearSteps('Antrag prüfen, dann genehmigen, dann archivieren')).toEqual([
      'Antrag prüfen',
      'genehmigen',
      'archivieren',
    ]);
    expect(linearSteps('收集文件然后审核然后归档')).toEqual(['收集文件', '审核', '归档']);
  });

  it('does not split idiomatic non-sequential uses of then', () => {
    expect(linearSteps('Back then we mailed forms; now we scan them')).toEqual([
      'Back then we mailed forms',
      'now we scan them',
    ]);
    expect(linearSteps('Receive the file and then some cleanup happens')).toEqual([
      'Receive the file and then some cleanup happens',
    ]);
  });

  it('never truncates long SOPs silently and rejects only beyond the explicit cap', () => {
    const fifty = Array.from({ length: 50 }, (_, index) => `${index + 1}. Step ${index + 1}`).join('\n');
    expect(linearSteps(fifty)).toHaveLength(50);
    const tooMany = Array.from(
      { length: MAX_GENERATED_STEPS + 1 },
      (_, index) => `${index + 1}. Step ${index + 1}`,
    ).join('\n');
    expect(() => linearSteps(tooMany)).toThrow(DescriptionParseError);
    expect(() => linearSteps(tooMany)).toThrow(`supports up to ${MAX_GENERATED_STEPS}`);
  });

  it('rejects input that cannot name a process step', () => {
    expect(() => linearSteps('🎉🎉🎉')).toThrow('Use words or numbers');
    expect(() => linearSteps('a'.repeat(MAX_DESCRIPTION_CHARS + 1))).toThrow('Description is too long');
  });
});

describe('linearBpmnXml', () => {
  it('builds Start → user-named task → End from a single sentence', () => {
    const xml = linearBpmnXml('Invoice', 'Pay the invoice after review.');
    const preview = previewBpmn(xml);
    expect(preview.kind).toBe('process');
    expect(xml).toContain('name="Pay the invoice after review"');
    expect(xml).not.toContain('name="Task"');
    expect(xml).not.toContain('exclusiveGateway');
  });

  it('builds a linear task chain from then-clauses', () => {
    const xml = linearBpmnXml('Hire', 'Receive application then screen then interview');
    const preview = previewBpmn(xml);
    expect(preview.kind).toBe('process');
    expect(preview.happyPath).toContain('Receive application');
    expect(preview.happyPath).toContain('screen');
    expect(preview.happyPath).toContain('interview');
    expect(preview.branches).toEqual([]);
  });
});
