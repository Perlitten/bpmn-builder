import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/build/**',
      '**/coverage/**',
      '**/graphify-out/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'packages/db/migrations/**',
    ],
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2022,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    // Vite bundles app imports. The raw Vercel Node function traces package
    // source directly until internal packages emit real runtime JS artifacts.
    files: ['apps/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/src/**'],
              message: 'Use the public @bpmn/* package API instead of another package source tree.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/domain/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@bpmn/semantic-core',
              message: 'Persistence domain types must not depend on the semantic BPMN graph.',
            },
          ],
          patterns: [
            {
              group: ['**/src/**'],
              message: 'Persistence domain types must not depend on the semantic BPMN graph.',
            },
          ],
        },
      ],
    },
  },
);
