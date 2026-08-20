/// <reference types="vite/client" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
