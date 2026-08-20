import fs from 'node:fs';
import path from 'node:path';

const assetsDir = path.resolve('apps/web/dist/assets');
const limits = new Map([
  ['.js', 1_200_000],
  ['.css', 200_000],
]);

if (!fs.existsSync(assetsDir)) {
  throw new Error('Production assets are missing. Run pnpm build first.');
}

const violations = [];
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
