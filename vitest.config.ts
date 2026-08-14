import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      name: 'stub-css',
      transform(_code, id) {
        if (id.endsWith('.css')) return { code: '', map: null };
      },
    },
  ],
  test: {
    environment: 'node',
    include: ['packages/**/*.{test,spec}.ts', 'apps/**/*.{test,spec}.ts'],
  },
});
