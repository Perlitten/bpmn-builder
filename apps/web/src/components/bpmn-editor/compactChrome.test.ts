import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EditorChrome } from '../shell/EditorChrome';

const dir = dirname(fileURLToPath(import.meta.url));

const chromeProps = {
  name: 'Order',
  savePhase: 'idle' as const,
  savedAt: null,
  busy: false,
  notice: null,
  simulating: false,
  simStatus: null,
  onBack: () => undefined,
  onNameChange: () => undefined,
  onNameCommit: () => undefined,
  onExport: () => undefined,
  onExportSvg: () => undefined,
  onExportPdf: () => undefined,
  onExportPng: () => undefined,
  onSaveTemplate: () => undefined,
  onClear: () => undefined,
  onToggleSimulate: () => undefined,
  onResetSimulation: () => undefined,
  canUndo: false,
  canRedo: false,
  onUndo: () => undefined,
  onRedo: () => undefined,
};

describe('compact editor chrome', () => {
  it('docks the catalog as a bottom bar only at phone widths', () => {
    const css = readFileSync(join(dir, 'palette/palette.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 560px\)/);
    expect(css).toMatch(/flex-direction:\s*row/);
    expect(css).toMatch(/width:\s*100%/);
    expect(css).toMatch(/border-right:\s*0/);
  });

  it('stacks a shorter inspector under the canvas so the diagram keeps vertical space', () => {
    const css = readFileSync(join(dir, 'inspector/inspector.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 560px\)[\s\S]*width:\s*100%/);
    expect(css).toMatch(/max-height:\s*min\(24dvh, 168px\)/);
  });

  it('docks Architect as a collapsed chip above the catalog bar', () => {
    const css = readFileSync(join(dir, 'architect/architect.css'), 'utf8');
    expect(css).toMatch(/\.architect-shell\.is-docked/);
    expect(css).toMatch(/\.architect-shell\.is-collapsed/);
    expect(css).toMatch(/--editor-compact-rail/);
  });

  it('keeps a single-row compact header with only Simulate and More as actions', () => {
    const html = renderToStaticMarkup(createElement(EditorChrome, { ...chromeProps, compact: true }));
    expect(html).toMatch(/flex-nowrap/);
    expect(html).toMatch(/aria-label="Back to process list"/);
    expect(html).toMatch(/aria-label="Process name"/);
    expect(html).toMatch(/aria-label="More editor actions"/);
    expect(html).toContain('More');
    expect(html).toContain('Simulate');
    expect(html).toContain('Skip to diagram');
    expect(html).not.toMatch(/>Export BPMN</);
    expect(html).not.toMatch(/>Save as template</);
  });

  it('puts a lucide icon on every More overflow row', () => {
    const src = readFileSync(join(dir, '../shell/EditorChrome.tsx'), 'utf8');
    expect(src).toMatch(/icon=\{<MenuIcon icon=\{FileCode\}[\s\S]*?Download BPMN/);
    expect(src).toMatch(/icon=\{<MenuIcon icon=\{FileImage\}[\s\S]*?SVG · vector/);
    expect(src).toMatch(/icon=\{<MenuIcon icon=\{FileText\}[\s\S]*?PDF · printable/);
    expect(src).toMatch(/PNG · raster/);
    expect(src).toMatch(/icon=\{<MenuIcon icon=\{LayoutTemplate\}[\s\S]*?Save as template/);
    expect(src).toMatch(/icon=\{<MenuIcon icon=\{RotateCcw\}[\s\S]*?Reset process/);
    expect(src).not.toMatch(/text-danger[\s\S]*Reset process|Reset process[\s\S]*text-danger/);
  });

  it('uses the same predictable action hierarchy on desktop', () => {
    const html = renderToStaticMarkup(createElement(EditorChrome, { ...chromeProps, compact: false }));
    expect(html).toContain('Simulate');
    expect(html).toMatch(/aria-label="More editor actions"/);
    expect(html).not.toContain('Save draft');
    expect(html).not.toContain('Clear');
  });

  it('shows token simulation status while simulating', () => {
    const status = 'Token on Review — click a sequence flow to choose XOR branch';
    const html = renderToStaticMarkup(
      createElement(EditorChrome, {
        ...chromeProps,
        compact: false,
        simulating: true,
        simStatus: status,
      }),
    );
    expect(html).toContain(status);
    expect(html).toContain('Stop');
    expect(html).not.toMatch(/max-w-\[min\(28rem,40vw\)\]/);
    const css = readFileSync(join(dir, '../../index.css'), 'utf8');
    expect(css).toMatch(/sim-choice/);
    expect(css).toMatch(/stroke-dasharray/);
    expect(css).toMatch(/sim-click/);
    const palette = readFileSync(join(dir, 'palette/palette.css'), 'utf8');
    expect(palette).toMatch(/\.palette-hint\.is-sim/);
  });

  it('shows the designed loading state while the simulation bootstraps', () => {
    const html = renderToStaticMarkup(
      createElement(EditorChrome, {
        ...chromeProps,
        simulating: true,
        simulationStarting: true,
      }),
    );
    expect(html).toContain('Starting simulation…');
    expect(html).toMatch(/aria-busy="true"/);
    expect(html).toMatch(/disabled/);
  });

  it('gives zoom controls a focus-visible ring', () => {
    const css = readFileSync(join(dir, 'zoomControls.css'), 'utf8');
    const ui = readFileSync(join(dir, '../ui/ui.css'), 'utf8');
    expect(css).toMatch(/\.bpmn-zoom-value/);
    expect(ui).toMatch(/:where\(button,[\s\S]*?\):focus-visible/);
    expect(ui).toMatch(/outline:\s*2px solid var\(--color-ink\)/);
  });
});
