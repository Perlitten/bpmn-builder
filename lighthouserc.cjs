module.exports = {
  ci: {
    collect: {
      startServerCommand:
        'NODE_ENV=production DB_PROVIDER=sqlite DATABASE_URL=file:./data/lighthouse.db SESSION_SECRET=lighthouse-ci-session-secret-at-least-16-chars PORT=4173 pnpm --filter @bpmn/api-server start',
      startServerReadyPattern: 'BPMN builder running',
      url: ['http://localhost:4173/'],
      numberOfRuns: 2,
      settings: {
        chromeFlags: '--headless --no-sandbox',
        preset: 'desktop',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.75 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'first-contentful-paint': ['error', { maxNumericValue: 3000 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 4000 }],
        'total-blocking-time': ['error', { maxNumericValue: 500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: './lighthouse-reports',
    },
  },
};
