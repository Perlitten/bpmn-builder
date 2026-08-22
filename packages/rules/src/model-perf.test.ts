import { describe, it, expect } from 'vitest';
import { toLintModel } from './model.js';

describe('XML parsing performance', () => {
  it('parses deeply nested documents quickly through the production path', () => {
    const NESTING_DEPTH = 2000;
    let xml = '<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1"><bpmn:process id="Process_1">';
    for (let i = 0; i < NESTING_DEPTH; i++) xml += `<bpmn:subProcess id="SubProcess_${i}">`;
    for (let i = 0; i < NESTING_DEPTH; i++) xml += `</bpmn:subProcess>`;
    xml += '</bpmn:process></bpmn:definitions>';

    // Measure parser CPU, not scheduler stalls from parallel coverage workers.
    const start = process.cpuUsage();
    toLintModel(xml);
    const usage = process.cpuUsage(start);
    const cpuMs = (usage.user + usage.system) / 1000;
    console.info(`CPU time: ${cpuMs.toFixed(1)}ms`);
    expect(cpuMs).toBeLessThan(1000);
  });
});
