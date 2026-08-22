import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const uiDir = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(uiDir, '../..');
const tokenCss = join(srcDir, 'styles/tokens.css');

function filesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const authoredStyles = filesUnder(srcDir).filter((file) => file.endsWith('.css') && file !== tokenCss);
const componentSources = [join(srcDir, 'components'), join(srcDir, 'pages')]
  .flatMap(filesUnder)
  .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));

function sourceLabel(file: string): string {
  return relative(srcDir, file).replaceAll('\\', '/');
}

describe('product design-system contract', () => {
  it('defines the semantic tokens consumed by product components', () => {
    const css = readFileSync(tokenCss, 'utf8');
    for (const token of [
      '--color-border-interactive',
      '--color-border-disabled',
      '--color-ink-disabled',
      '--color-google-blue',
      '--mask-opaque',
      '--shadow-pixel-cta',
      '--space-1',
      '--space-9',
      '--radius-0',
      '--radius-2',
      '--fs-10',
      '--fs-14',
      '--dur-instant',
      '--dur-overlay',
      '--dur-tooltip',
      '--landing-token-morph-duration',
      '--z-import-hold',
      '--z-inspector',
      '--z-menu',
      '--z-rail-open',
      '--z-landing-overlay',
      '--control-hit',
      '--control-visual',
      '--editor-inspector-min',
      '--editor-inspector-max',
      '--editor-inspector-stub',
      '--editor-minimap-width',
      '--editor-minimap-height',
    ]) {
      expect(css, `missing ${token}`).toContain(token);
    }
  });

  it('generates a clean, versioned token stylesheet with unique names', () => {
    const source = JSON.parse(readFileSync(join(srcDir, 'styles/tokens.json'), 'utf8')) as {
      version: string;
      theme: Record<string, Record<string, string>>;
      root: Record<string, Record<string, string>>;
    };
    expect(source.version).toMatch(/^\d+\.\d+\.\d+$/);
    const names = [...Object.values(source.theme), ...Object.values(source.root)].flatMap(Object.keys);
    expect(new Set(names).size).toBe(names.length);
    const result = spawnSync(process.execPath, [resolve(srcDir, '../../../scripts/generate-tokens.mjs'), '--check']);
    expect(result.status, result.stderr.toString()).toBe(0);
  });

  it('self-hosts every Inter weight required by the product contract', () => {
    const fonts = readFileSync(join(srcDir, 'styles/productFonts.ts'), 'utf8');
    for (const weight of [400, 500, 600, 700]) expect(fonts).toContain(`inter/latin-${weight}.css`);
  });

  it('keeps raw colors in the generated token layer across every authored surface', () => {
    const rawColor = /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\(/i;
    for (const file of [...authoredStyles, ...componentSources]) {
      expect(readFileSync(file, 'utf8'), sourceLabel(file)).not.toMatch(rawColor);
    }
  });

  it('keeps every authored component radius on the zero/two-pixel token contract', () => {
    for (const file of authoredStyles) {
      const css = readFileSync(file, 'utf8');
      for (const match of css.matchAll(/border-radius:\s*([^;]+);/gi)) {
        expect(match[1]?.trim(), `${sourceLabel(file)}: ${match[0]}`).toMatch(
          /^var\(--radius-(?:0|2)\)$/,
        );
      }
    }

    for (const file of componentSources) {
      expect(readFileSync(file, 'utf8'), sourceLabel(file)).not.toMatch(/\brounded(?:-|\b)/);
    }
  });

  it('uses named global layers and prevents visual token bypasses in components', () => {
    for (const file of authoredStyles) {
      const css = readFileSync(file, 'utf8');
      for (const match of css.matchAll(/z-index:\s*([^;]+);/gi)) {
        expect(match[1]?.trim(), `${sourceLabel(file)}: ${match[0]}`).toMatch(
          /^(?:var\(--z-[a-z0-9-]+\)|-1|0|1|auto)$/,
        );
      }
    }

    const rawTailwindPalette =
      /\b(?:bg|text|border|outline|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
    const inlineVisualBypass =
      /\b(?:backgroundColor|borderColor|borderRadius|boxShadow|outlineColor|zIndex)\s*:|\b[A-Z0-9_]*Z_INDEX\s*=/;
    for (const file of componentSources) {
      const source = readFileSync(file, 'utf8');
      expect(source, sourceLabel(file)).not.toMatch(rawTailwindPalette);
      expect(source, sourceLabel(file)).not.toMatch(inlineVisualBypass);
    }
  });
});
