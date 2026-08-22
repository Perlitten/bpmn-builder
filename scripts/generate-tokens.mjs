import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sourceUrl = new URL('../apps/web/src/styles/tokens.json', import.meta.url);
const outputUrl = new URL('../apps/web/src/styles/tokens.css', import.meta.url);

function renderBlock(selector, groups, seen) {
  const lines = [`${selector} {`];
  for (const [group, tokens] of Object.entries(groups)) {
    lines.push(`  /* ${group} */`);
    for (const [name, value] of Object.entries(tokens)) {
      if (!/^--[a-z0-9-]+$/.test(name)) throw new Error(`Invalid token name: ${name}`);
      if (seen.has(name)) throw new Error(`Duplicate token name: ${name}`);
      if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid value for ${name}`);
      seen.add(name);
      lines.push(`  ${name}: ${value};`);
    }
    lines.push('');
  }
  if (lines.at(-1) === '') lines.pop();
  lines.push('}');
  return lines.join('\n');
}

export function generateTokens(source) {
  if (!/^\d+\.\d+\.\d+$/.test(source.version ?? '')) throw new Error('tokens.json needs a semver version');
  const seen = new Set();
  return `${[
    `/* Generated from tokens.json v${source.version}. Run pnpm tokens:generate; do not edit. */`,
    renderBlock('@theme', source.theme ?? {}, seen),
    renderBlock(':root', source.root ?? {}, seen),
  ].join('\n\n')}\n`;
}

const source = JSON.parse(await readFile(sourceUrl, 'utf8'));
const generated = generateTokens(source);
if (process.argv.includes('--check')) {
  const current = await readFile(outputUrl, 'utf8').catch(() => '');
  if (current !== generated) {
    process.stderr.write('tokens.css is stale. Run pnpm tokens:generate.\n');
    process.exitCode = 1;
  }
} else {
  await writeFile(fileURLToPath(outputUrl), generated);
}
