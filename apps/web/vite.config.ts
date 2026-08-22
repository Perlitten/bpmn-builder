/// <reference types="vite/client" />
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootPackageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8')) as { version: string };
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

function localCommitVersion(): string {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim();
    return `${sha}${dirty ? '-dirty' : ''}`;
  } catch {
    return '';
  }
}

const commitVersion = process.env.NODE_ENV === 'test'
  ? 'test'
  : process.env.VERCEL_GIT_COMMIT_SHA?.trim() || localCommitVersion();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPackageJson.version),
    __COMMIT_SHA__: JSON.stringify(commitVersion),
  },
  server: {
    middlewareMode: true,
  },
  optimizeDeps: {
    include: ['bpmn-js/lib/Modeler', 'bpmn-js/lib/features/replace/ReplaceOptions'],
    exclude: [
      '@bpmn/agent-tools',
      '@bpmn/semantic-core',
      '@bpmn/rules',
      '@bpmn/layout-engine',
      '@bpmn/bpmn-adapter',
      '@bpmn/simulate',
    ],
  },
});
