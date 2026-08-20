import { describe, it, expect } from 'vitest';
import { toLintModel } from './model.js';

describe('XML parsing performance', () => {
  it('parses deeply nested documents quickly through the production path', () => {
    const NESTING_DEPTH = 2000;
    let xml = '<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1"><bpmn:process id="Process_1">';
    for (let i = 0; i < NESTING_DEPTH; i++) xml += `<bpmn:subProcess id="SubProcess_${i}">`;
    for (let i = 0; i < NESTING_DEPTH; i++) xml += `</bpmn:subProcess>`;
    xml += '</bpmn:process></bpmn:definitions>';

    const start = Date.now();
    toLintModel(xml);
    const duration = Date.now() - start;
    console.info(`Time taken: ${duration}ms`);
    expect(duration).toBeLessThan(1000);
  });
});
