import fs from 'node:fs';
import path from 'node:path';

const assetsDir = path.resolve('apps/web/dist/assets');
const limits = new Map([
  ['.js', 720_000],
  ['.css', 165_000],
]);
const ENTRY_JS_LIMIT = 250_000;

if (!fs.existsSync(assetsDir)) {
  throw new Error('Production assets are missing. Run pnpm build first.');
}

const violations = [];
const indexHtml = fs.readFileSync(path.resolve('apps/web/dist/index.html'), 'utf8');
const entryMatch = /<script[^>]+src="\/assets\/([^"]+\.js)"/.exec(indexHtml);
if (!entryMatch) {
  violations.push('Could not identify the entry JavaScript chunk from dist/index.html');
} else {
  const entryBytes = fs.statSync(path.join(assetsDir, entryMatch[1])).size;
  if (entryBytes > ENTRY_JS_LIMIT) {
    violations.push(`${entryMatch[1]}: ${entryBytes} bytes exceeds entry budget ${ENTRY_JS_LIMIT}`);
  }
}
for (const name of fs.readdirSync(assetsDir)) {
  const extension = path.extname(name);
  const limit = limits.get(extension);
  if (!limit) continue;
  const bytes = fs.statSync(path.join(assetsDir, name)).size;
  if (bytes > limit) violations.push(`${name}: ${bytes} bytes exceeds ${limit}`);
}

if (violations.length > 0) {
  throw new Error(`Production bundle budget exceeded:\n${violations.join('\n')}`);
}

console.info('Production JavaScript and CSS bundles are within budget.');
