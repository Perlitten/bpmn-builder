/// <reference types="vite/client" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootPackageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8')) as { version: string };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPackageJson.version),
    __COMMIT_SHA__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? ''),
  },
  server: {
    middlewareMode: true,
  },
  optimizeDeps: {
    include: ['bpmn-js/lib/Modeler', 'bpmn-js/lib/NavigatedViewer', 'bpmn-js/lib/features/replace/ReplaceOptions'],
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
