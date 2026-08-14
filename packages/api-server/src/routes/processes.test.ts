import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate, resetDbForTests } from '@bpmn/db';
import { PROCESS_NAME_MAX } from '../../../domain/src/index.js';
import { createApp } from '../app.js';
import { copyProcessName } from '../services/processService.js';

const listen = (app: ReturnType<typeof createApp>) =>
  new Promise<{ server: http.Server; url: string }>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('no port');
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });

describe('copyProcessName', () => {
  it('appends (copy) and stays within the name limit', () => {
    expect(copyProcessName('Invoice review')).toBe('Invoice review (copy)');
    expect(copyProcessName('  ')).toBe('Untitled process (copy)');
    const long = 'x'.repeat(PROCESS_NAME_MAX);
    expect(copyProcessName(long).length).toBeLessThanOrEqual(PROCESS_NAME_MAX);
    expect(copyProcessName(long).endsWith(' (copy)')).toBe(true);
  });
});

describe('process template routes', () => {
  const snapshot = { ...process.env };
  const servers: http.Server[] = [];

  beforeEach(async () => {
    process.env.DB_PROVIDER = 'sqlite';
    process.env.DATABASE_URL = ':memory:';
    delete process.env.SQLITE_PATH;
    resetDbForTests();
    await migrate();
  });

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
    resetDbForTests();
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  it('saves a copy as template and lists it', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);

    const created = await fetch(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Onboarding' }),
    });
    expect(created.status).toBe(201);
    const { process } = (await created.json()) as { process: { id: string; bpmnXml: string } };

    const drafted = await fetch(`${url}/api/processes/${process.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'draft', version: 1 }),
    });
    expect(drafted.status, await drafted.text()).toBe(200);

    const templated = await fetch(`${url}/api/processes/${process.id}/template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bpmnXml: process.bpmnXml }),
    });
    expect(templated.status).toBe(201);
    const { process: template } = (await templated.json()) as {
      process: { id: string; status: string; name: string; bpmnXml: string };
    };
    expect(template.id).not.toBe(process.id);
    expect(template.status).toBe('template');
    expect(template.name).toBe('Onboarding template');
    expect(template.bpmnXml).toBe(process.bpmnXml);

    const listed = await fetch(`${url}/api/templates`);
    expect(listed.status).toBe(200);
    const { templates } = (await listed.json()) as { templates: { id: string }[] };
    expect(templates.some((item) => item.id === template.id)).toBe(true);

    const fromTemplate = await fetch(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'From template', templateId: template.id }),
    });
    expect(fromTemplate.status).toBe(201);
    const { process: copy } = (await fromTemplate.json()) as {
      process: { status: string; bpmnXml: string };
    };
    expect(copy.status).toBe('draft');
    expect(copy.bpmnXml).toBe(template.bpmnXml);
  });

  it('duplicates a process as a new draft with copied XML and name', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);

    const created = await fetch(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Invoice review', description: 'AP flow' }),
    });
    expect(created.status).toBe(201);
    const { process } = (await created.json()) as {
      process: { id: string; name: string; description: string | null; bpmnXml: string; status: string };
    };

    const duplicated = await fetch(`${url}/api/processes/${process.id}/duplicate`, { method: 'POST' });
    expect(duplicated.status).toBe(201);
    const { process: copy } = (await duplicated.json()) as {
      process: { id: string; name: string; description: string | null; bpmnXml: string; status: string };
    };
    expect(copy.id).not.toBe(process.id);
    expect(copy.name).toBe('Invoice review (copy)');
    expect(copy.description).toBe('AP flow');
    expect(copy.bpmnXml).toBe(process.bpmnXml);
    expect(copy.status).toBe('draft');

    const listed = await fetch(`${url}/api/processes?kind=process&limit=100`);
    const page = (await listed.json()) as { processes: { id: string; name: string }[] };
    expect(page.processes.some((item) => item.id === copy.id && item.name === 'Invoice review (copy)')).toBe(true);

    const missing = await fetch(`${url}/api/processes/not-a-process/duplicate`, { method: 'POST' });
    expect(missing.status).toBe(404);
  });

  it('duplicates a process with an explicit name from the request body', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);

    const created = await fetch(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Invoice review' }),
    });
    expect(created.status).toBe(201);
    const { process } = (await created.json()) as { process: { id: string } };

    const duplicated = await fetch(`${url}/api/processes/${process.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'AP clone' }),
    });
    expect(duplicated.status).toBe(201);
    const { process: copy } = (await duplicated.json()) as { process: { id: string; name: string } };
    expect(copy.id).not.toBe(process.id);
    expect(copy.name).toBe('AP clone');
  });
});

describe('process list query', () => {
  const snapshot = { ...process.env };
  const servers: http.Server[] = [];

  beforeEach(async () => {
    process.env.DB_PROVIDER = 'sqlite';
    process.env.DATABASE_URL = ':memory:';
    delete process.env.SQLITE_PATH;
    resetDbForTests();
    await migrate();
  });

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
    resetDbForTests();
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  async function postProcess(url: string, name: string, description?: string) {
    const created = await fetch(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    expect(created.status).toBe(201);
    return (await created.json()) as { process: { id: string; bpmnXml: string; name: string } };
  }

  it('paginates, filters by kind, searches, and sorts without invented statuses', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);

    const zebra = await postProcess(url, 'Zebra approval', 'finance route');
    await new Promise((r) => setTimeout(r, 5));
    const alpha = await postProcess(url, 'alpha onboarding');
    await new Promise((r) => setTimeout(r, 5));
    for (let i = 0; i < 22; i += 1) {
      await postProcess(url, `Batch ${String(i).padStart(2, '0')}`);
    }

    const templated = await fetch(`${url}/api/processes/${alpha.process.id}/template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(templated.status).toBe(201);

    const listed = await fetch(`${url}/api/processes`);
    expect(listed.status).toBe(200);
    const page1 = (await listed.json()) as {
      processes: { id: string; name: string; bpmnXml: string; status: string }[];
      total: number;
      page: number;
      limit: number;
    };
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(20);
    expect(page1.total).toBe(25);
    expect(page1.processes).toHaveLength(20);
    expect(page1.processes[0]?.bpmnXml).toContain('startEvent');
    expect(page1.processes[0]?.bpmnXml).toContain('task');
    expect(page1.processes[0]?.bpmnXml).toContain('endEvent');

    const page2 = (await (
      await fetch(`${url}/api/processes?page=2`)
    ).json()) as { processes: unknown[]; total: number; page: number };
    expect(page2.page).toBe(2);
    expect(page2.total).toBe(25);
    expect(page2.processes).toHaveLength(5);

    const templates = (await (
      await fetch(`${url}/api/processes?kind=template`)
    ).json()) as { processes: { status: string; name: string }[]; total: number };
    expect(templates.total).toBe(1);
    expect(templates.processes[0]?.status).toBe('template');
    expect(templates.processes[0]?.name).toBe('alpha onboarding template');

    const processesOnly = (await (
      await fetch(`${url}/api/processes?kind=process&limit=100`)
    ).json()) as { processes: { status: string }[]; total: number };
    expect(processesOnly.total).toBe(24);
    expect(processesOnly.processes.every((item) => item.status !== 'template')).toBe(true);

    const search = (await (
      await fetch(`${url}/api/processes?q=finance`)
    ).json()) as { processes: { id: string }[]; total: number };
    expect(search.total).toBe(1);
    expect(search.processes[0]?.id).toBe(zebra.process.id);

    const byName = (await (
      await fetch(`${url}/api/processes?sort=name&q=approval`)
    ).json()) as { processes: { name: string }[]; total: number };
    expect(byName.total).toBe(1);
    expect(byName.processes[0]?.name).toBe('Zebra approval');

    const named = (await (
      await fetch(`${url}/api/processes?sort=name&limit=100`)
    ).json()) as { processes: { name: string }[] };
    const names = named.processes.map((item) => item.name);
    expect(names[0]).toBe('alpha onboarding');
    expect(names.indexOf('alpha onboarding template')).toBeLessThan(names.indexOf('Batch 00'));
    expect(names[names.length - 1]).toBe('Zebra approval');

    const namedDesc = (await (
      await fetch(`${url}/api/processes?sort=name_desc&limit=100`)
    ).json()) as { processes: { name: string }[] };
    expect(namedDesc.processes[0]?.name).toBe('Zebra approval');
    expect(namedDesc.processes.at(-1)?.name).toBe('alpha onboarding');

    const oldest = (await (
      await fetch(`${url}/api/processes?sort=updated_asc&limit=100`)
    ).json()) as { processes: { id: string }[] };
    expect(oldest.processes[0]?.id).toBe(zebra.process.id);

    const badKind = await fetch(`${url}/api/processes?kind=draft`);
    expect(badKind.status).toBe(400);
    const badLimit = await fetch(`${url}/api/processes?limit=101`);
    expect(badLimit.status).toBe(400);
  });
});

describe('process BPMN import', () => {
  const snapshot = { ...process.env };
  const servers: http.Server[] = [];

  beforeEach(async () => {
    process.env.DB_PROVIDER = 'sqlite';
    process.env.DATABASE_URL = ':memory:';
    delete process.env.SQLITE_PATH;
    resetDbForTests();
    await migrate();
  });

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
    resetDbForTests();
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  const VALID = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start" />
    <bpmn:endEvent id="EndEvent_1" name="End" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

  async function postXml(url: string, bpmnXml: string) {
    return fetch(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Imported', bpmnXml }),
    });
  }

  it('stores BPMN 2.0 XML as-is and rejects HTML/JSON/empty process', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);

    const created = await postXml(url, VALID);
    expect(created.status).toBe(201);
    const body = (await created.json()) as { process: { bpmnXml: string } };
    expect(body.process.bpmnXml).toBe(VALID);

    const html = await postXml(url, '<html></html>');
    expect(html.status).toBe(400);
    expect(((await html.json()) as { error: string }).error).toMatch(/HTML/);

    const json = await postXml(url, '{"nodes":[]}');
    expect(json.status).toBe(400);
    expect(((await json.json()) as { error: string }).error).toMatch(/JSON/);

    const emptyProcess = await postXml(
      url,
      `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="Process_1"/></bpmn:definitions>`,
    );
    expect(emptyProcess.status).toBe(400);
    expect(((await emptyProcess.json()) as { error: string }).error).toMatch(/flow nodes|no process/i);
  });
});

describe('process write guards', () => {
  const snapshot = { ...process.env };
  const servers: http.Server[] = [];

  beforeEach(async () => {
    process.env.DB_PROVIDER = 'sqlite';
    process.env.DATABASE_URL = ':memory:';
    delete process.env.SQLITE_PATH;
    resetDbForTests();
    await migrate();
  });

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
    resetDbForTests();
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  it('rejects a 200-character-plus name', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);
    const created = await fetch(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'n'.repeat(201) }),
    });
    expect(created.status).toBe(400);
  });

  it('returns 409 when PATCH uses a stale version', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);
    const created = await fetch(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Lock' }),
    });
    const { process } = (await created.json()) as { process: { id: string; version: number } };
    const first = await fetch(`${url}/api/processes/${process.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'One', version: process.version }),
    });
    expect(first.status).toBe(200);
    const second = await fetch(`${url}/api/processes/${process.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Two', version: process.version }),
    });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: string; currentVersion: number };
    expect(body.currentVersion).toBe(2);
  });

  it('deletes a process and 404s the second delete', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);
    const created = await fetch(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Gone' }),
    });
    const { process } = (await created.json()) as { process: { id: string } };
    const deleted = await fetch(`${url}/api/processes/${process.id}`, { method: 'DELETE' });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ deleted: true, id: process.id });
    const again = await fetch(`${url}/api/processes/${process.id}`, { method: 'DELETE' });
    expect(again.status).toBe(404);
    const missing = await fetch(`${url}/api/processes/not-a-process`, { method: 'DELETE' });
    expect(missing.status).toBe(404);
  });

  it('returns JSON 400 for malformed JSON and JSON 404 for unknown /api', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);
    const bad = await fetch(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(bad.status).toBe(400);
    expect(bad.headers.get('content-type')).toMatch(/json/);
    const body = (await bad.json()) as { error: string };
    expect(body.error).toBe('invalid JSON');
    expect(JSON.stringify(body)).not.toMatch(/JSON\.parse|damashkevich/);
    const unknown = await fetch(`${url}/api/nope`);
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get('content-type')).toMatch(/json/);
  });
});
