import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RUNTIME_ROOTS = [
  'api',
  'packages/agent-tools/src',
  'packages/api-server/src',
  'packages/bpmn-adapter/src',
  'packages/db/src',
  'packages/domain/src',
  'packages/layout-engine/src',
  'packages/rules/src',
  'packages/semantic-core/src',
];

function productionTypeScriptFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const target = join(path, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(target);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return [];
    return [target];
  });
}

describe('Vercel Node function imports', () => {
  it('keeps the server runtime graph traceable without unresolved workspace package exports', () => {
    const unresolved = RUNTIME_ROOTS.flatMap(productionTypeScriptFiles).filter((file) =>
      /(?:from|import\s*)\s*['"]@bpmn\//.test(readFileSync(file, 'utf8')),
    );
    expect(unresolved).toEqual([]);
  });
});
