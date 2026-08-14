import { describe, expect, it, vi } from 'vitest';
import {
  applyXmlToViewer,
  diagramSvgFrom,
  holdDiagram,
  IMPORT_HOLD_ATTR,
  isImportableXml,
  type HoldClone,
  type HoldSvg,
} from './applyXmlToViewer';

const NEXT = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Next"><bpmn:task id="T1" /></bpmn:process>
</bpmn:definitions>`;
const GOOD = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:collaboration id="C"><bpmn:participant id="Pool_1" /></bpmn:collaboration>
</bpmn:definitions>`;

function fakeSvg() {
  const log: string[] = [];
  const clone: HoldClone = {
    setAttribute(name, value) {
      log.push(`attr:${name}=${value}`);
    },
    remove() {
      log.push('release');
    },
  };
  const svg: HoldSvg = {
    style: { visibility: '' },
    cloneNode() {
      return clone;
    },
    parentElement: {
      appendChild() {
        log.push('hold');
      },
    },
  };
  return { svg, log };
}

describe('isImportableXml', () => {
  it('rejects blank XML that would clear the canvas', () => {
    expect(isImportableXml('')).toBe(false);
    expect(isImportableXml('   \n')).toBe(false);
    expect(isImportableXml('<bpmn:process id="P"/>')).toBe(false);
    expect(isImportableXml(NEXT)).toBe(true);
  });
});

describe('holdDiagram', () => {
  it('clones the live svg and hides it until release', () => {
    const { svg, log } = fakeSvg();
    const hold = holdDiagram(svg);
    expect(log).toContain('hold');
    expect(log).toContain(`attr:${IMPORT_HOLD_ATTR}=`);
    expect(svg.style.visibility).toBe('hidden');
    hold.release();
    expect(log.at(-1)).toBe('release');
    expect(svg.style.visibility).toBe('');
  });
});

describe('applyXmlToViewer', () => {
  it('does not clear the viewer to empty XML before the next import', async () => {
    const { svg, log } = fakeSvg();
    const calls: string[] = [];
    await applyXmlToViewer(
      {
        importXML: async (xml) => {
          expect(log).toContain('hold');
          expect(svg.style.visibility).toBe('hidden');
          expect(xml.trim()).not.toBe('');
          expect(isImportableXml(xml)).toBe(true);
          calls.push(xml);
        },
      },
      NEXT,
      { container: { querySelector: () => svg } },
    );
    expect(calls).toEqual([NEXT]);
    expect(log.at(-1)).toBe('release');
  });

  it('refuses empty XML without touching the viewer', async () => {
    const importXML = vi.fn();
    await expect(applyXmlToViewer({ importXML }, '  ')).rejects.toThrow(/empty diagram/);
    expect(importXML).not.toHaveBeenCalled();
  });

  it('skips a second import when the canvas already shows that XML', async () => {
    const importXML = vi.fn();
    const afterImport = vi.fn();
    await applyXmlToViewer({ importXML }, NEXT, { displayedXml: NEXT, afterImport });
    expect(importXML).not.toHaveBeenCalled();
    expect(afterImport).toHaveBeenCalledOnce();
  });

  it('restores last good XML without an empty-xml clear when import fails', async () => {
    const calls: string[] = [];
    const { svg, log } = fakeSvg();
    await expect(
      applyXmlToViewer(
        {
          importXML: async (xml) => {
            expect(log).toContain('hold');
            calls.push(xml);
            if (xml === NEXT) throw new Error('root-0');
          },
        },
        NEXT,
        {
          lastGoodXml: GOOD,
          container: { querySelector: () => svg },
          afterRestore: () => log.push('restored'),
        },
      ),
    ).rejects.toThrow(/root-0/);
    expect(calls).toEqual([NEXT, GOOD]);
    expect(calls.some((xml) => !xml.trim() || !isImportableXml(xml))).toBe(false);
    expect(log).toContain('restored');
    expect(log.at(-1)).toBe('release');
  });

  it('finds the diagram-js svg, not an arbitrary descendant', () => {
    const inner = fakeSvg().svg;
    const root = fakeSvg().svg;
    expect(
      diagramSvgFrom({
        querySelector: (sel) => (sel === '.djs-container > svg' ? root : inner),
      }),
    ).toBe(root);
  });
});
