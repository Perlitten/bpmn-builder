import { spawn } from 'node:child_process';

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  throw new Error('npm_execpath is required to launch the Lighthouse test server');
}

const child = spawn(process.execPath, [pnpmCli, '--filter', '@bpmn/api-server', 'exec', 'tsx', 'src/index.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    DB_PROVIDER: 'sqlite',
    DATABASE_URL: 'file:./data/lighthouse.db',
    SESSION_SECRET: 'lighthouse-ci-session-secret-at-least-16-chars',
    PORT: '4173',
  },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
