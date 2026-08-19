import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { migrate } from '../../db/src/index.js';
import { createApp } from './app.js';
import { repairEmptyDiagrams, seedIfEmpty } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const webRoot = path.join(repoRoot, 'apps/web');
const PORT = Number(process.env.PORT || 5173);

async function startServer() {
  process.chdir(repoRoot);
  fs.mkdirSync(path.join(repoRoot, 'data'), { recursive: true });
  await migrate();
  await seedIfEmpty();
  await repairEmptyDiagrams();

  const app = createApp();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      root: webRoot,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const express = (await import('express')).default;
    const distPath = path.join(webRoot, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`BPMN builder running on http://localhost:${PORT}`);
  });
}

void startServer();
