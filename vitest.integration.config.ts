import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/db/src/integration.test.ts'],
    environment: 'node',
  },
});
