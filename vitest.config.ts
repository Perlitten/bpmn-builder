import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('0.1.0'),
    __COMMIT_SHA__: 'undefined',
  },
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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      include: ['packages/**/src/**/*.ts', 'apps/web/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.{test,spec}.ts',
        '**/*.d.ts',
        '**/index.ts',
        '**/vite-env.d.ts',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        statements: 60,
        branches: 50,
      },
    },
  },
});
