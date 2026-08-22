import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getProcessesTable, getQueryDb, migrate, resetDbForTests } from '@bpmn/db';
import { PROCESS_NAME_MAX } from '@bpmn/domain';
import { DEFAULT_EXECUTION_PROFILE, lintProcess } from '@bpmn/rules';
import { createApp } from '../app.js';
import { issueTestSession } from '../auth/testSession.js';
import { DEFAULT_BPMN_XML } from '../defaultBpmn.js';
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

let cookie = '';
let testUserId = '';

function authed(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('Cookie')) headers.set('Cookie', cookie);
  headers.set('X-BPMN-CSRF', '1');
  return fetch(url, { ...init, headers });
}

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
    const session = await issueTestSession();
    cookie = session.cookie;
    testUserId = session.user.id;
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

    const created = await authed(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Onboarding' }),
    });
    expect(created.status).toBe(201);
    const { process } = (await created.json()) as { process: { id: string; bpmnXml: string } };

    const drafted = await authed(`${url}/api/processes/${process.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'draft', version: 1 }),
    });
    expect(drafted.status, await drafted.text()).toBe(200);

    const templated = await authed(`${url}/api/processes/${process.id}/template`, {
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

    const listed = await authed(`${url}/api/templates`);
    expect(listed.status).toBe(200);
    const { templates } = (await listed.json()) as {
      templates: { id: string; builtin?: boolean; preview: { nodes: unknown[] } }[];
    };
    expect(templates.every((item) => !('bpmnXml' in item))).toBe(true);
    expect(templates.some((item) => item.id === template.id)).toBe(true);
    const builtin = templates.find((item) => item.id === 'starter:approval');
    expect(builtin).toMatchObject({ builtin: true });
    expect(builtin?.preview.nodes.length).toBeGreaterThan(0);

    const fromTemplate = await authed(`${url}/api/processes`, {
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

    const fromBuiltin = await authed(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Approval draft', templateId: 'starter:approval' }),
    });
    expect(fromBuiltin.status).toBe(201);
    expect(((await fromBuiltin.json()) as { process: { bpmnXml: string } }).process.bpmnXml).toContain('Review request');
  });

  it('duplicates a process as a new draft with copied XML and name', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);

    const created = await authed(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Invoice review', description: 'AP flow' }),
    });
    expect(created.status).toBe(201);
    const { process } = (await created.json()) as {
      process: { id: string; name: string; description: string | null; bpmnXml: string; status: string };
    };

    const duplicated = await authed(`${url}/api/processes/${process.id}/duplicate`, { method: 'POST' });
    expect(duplicated.status).toBe(201);
    const { process: copy } = (await duplicated.json()) as {
      process: { id: string; name: string; description: string | null; bpmnXml: string; status: string };
    };
    expect(copy.id).not.toBe(process.id);
    expect(copy.name).toBe('Invoice review (copy)');
    expect(copy.description).toBe('AP flow');
    expect(copy.bpmnXml).toBe(process.bpmnXml);
    expect(copy.status).toBe('draft');

    const listed = await authed(`${url}/api/processes?kind=process&limit=100`);
    const page = (await listed.json()) as { processes: { id: string; name: string }[] };
    expect(page.processes.some((item) => item.id === copy.id && item.name === 'Invoice review (copy)')).toBe(true);

    const missing = await authed(`${url}/api/processes/not-a-process/duplicate`, { method: 'POST' });
    expect(missing.status).toBe(404);
  });

  it('duplicates a process with an explicit name from the request body', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);

    const created = await authed(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Invoice review' }),
    });
    expect(created.status).toBe(201);
    const { process } = (await created.json()) as { process: { id: string } };

    const duplicated = await authed(`${url}/api/processes/${process.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'AP clone' }),
    });
    expect(duplicated.status).toBe(201);
    const { process: copy } = (await duplicated.json()) as { process: { id: string; name: string } };
    expect(copy.id).not.toBe(process.id);
    expect(copy.name).toBe('AP clone');
  });

  it('paginates and searches built-in plus user templates on the server', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);
    const db = getQueryDb();
    const table = getProcessesTable();
    const now = '2026-08-22T00:00:00.000Z';
    const workflowJson = JSON.stringify({
      processId: 'Process_1',
      nodes: [
        { id: 'StartEvent_1', type: 'startEvent', label: 'Start' },
        { id: 'Task_1', type: 'task', label: 'Task' },
        { id: 'EndEvent_1', type: 'endEvent', label: 'End' },
      ],
      edges: [
        { id: 'Flow_1', source: 'StartEvent_1', target: 'Task_1' },
        { id: 'Flow_2', source: 'Task_1', target: 'EndEvent_1' },
      ],
    });
    await db.insert(table).values(Array.from({ length: 25 }, (_, index) => ({
      id: `template-${index}`,
      userId: testUserId,
      name: `Custom ${String(index).padStart(2, '0')}`,
      description: null,
      status: 'template',
      bpmnXml: DEFAULT_BPMN_XML,
      workflowJson,
      version: 1,
      createdAt: now,
      updatedAt: now,
    })));

    const first = await authed(`${url}/api/templates?sort=name_asc&page=1&limit=20`);
    expect(first.status).toBe(200);
    const firstPage = (await first.json()) as {
      templates: { id: string; builtin?: boolean }[];
      total: number;
      page: number;
      limit: number;
    };
    expect(firstPage).toMatchObject({ total: 28, page: 1, limit: 20 });
    expect(firstPage.templates).toHaveLength(20);
    expect(firstPage.templates.slice(0, 3).every((template) => template.builtin)).toBe(true);

    const secondPage = (await (
      await authed(`${url}/api/templates?sort=name_asc&page=2&limit=20`)
    ).json()) as { templates: { id: string }[]; total: number };
    expect(secondPage.total).toBe(28);
    expect(secondPage.templates).toHaveLength(8);
    expect(secondPage.templates.every((template) => template.id.startsWith('template-'))).toBe(true);

    const search = (await (
      await authed(`${url}/api/templates?q=custom%2024&limit=20`)
    ).json()) as { templates: { name: string }[]; total: number };
    expect(search.total).toBe(1);
    expect(search.templates.map((template) => template.name)).toEqual(['Custom 24']);
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
    const session = await issueTestSession();
    cookie = session.cookie;
    testUserId = session.user.id;
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
    const created = await authed(`${url}/api/processes`, {
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

    const templated = await authed(`${url}/api/processes/${alpha.process.id}/template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(templated.status).toBe(201);

    const listed = await authed(`${url}/api/processes`);
    expect(listed.status).toBe(200);
    const page1 = (await listed.json()) as {
      processes: {
        id: string;
        name: string;
        status: string;
        structure: string;
        preview: { nodes: unknown[]; edges: unknown[] };
      }[];
      total: number;
      page: number;
      limit: number;
    };
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(20);
    expect(page1.total).toBe(25);
    expect(page1.processes).toHaveLength(20);
    expect(page1.processes[0]).not.toHaveProperty('bpmnXml');
    expect(page1.processes[0]?.structure).toContain('task');
    expect(page1.processes[0]?.preview.nodes.length).toBeGreaterThan(0);
    expect(page1.processes[0]?.preview.edges.length).toBeGreaterThan(0);

    const page2 = (await (
      await authed(`${url}/api/processes?page=2`)
    ).json()) as { processes: unknown[]; total: number; page: number };
    expect(page2.page).toBe(2);
    expect(page2.total).toBe(25);
    expect(page2.processes).toHaveLength(5);

    const templates = (await (
      await authed(`${url}/api/processes?kind=template`)
    ).json()) as { processes: { status: string; name: string }[]; total: number };
    expect(templates.total).toBe(1);
    expect(templates.processes[0]?.status).toBe('template');
    expect(templates.processes[0]?.name).toBe('alpha onboarding template');

    const processesOnly = (await (
      await authed(`${url}/api/processes?kind=process&limit=100`)
    ).json()) as { processes: { status: string }[]; total: number };
    expect(processesOnly.total).toBe(24);
    expect(processesOnly.processes.every((item) => item.status !== 'template')).toBe(true);

    const search = (await (
      await authed(`${url}/api/processes?q=finance`)
    ).json()) as { processes: { id: string }[]; total: number };
    expect(search.total).toBe(1);
    expect(search.processes[0]?.id).toBe(zebra.process.id);

    const byName = (await (
      await authed(`${url}/api/processes?sort=name&q=approval`)
    ).json()) as { processes: { name: string }[]; total: number };
    expect(byName.total).toBe(1);
    expect(byName.processes[0]?.name).toBe('Zebra approval');

    const named = (await (
      await authed(`${url}/api/processes?sort=name&limit=100`)
    ).json()) as { processes: { name: string }[] };
    const names = named.processes.map((item) => item.name);
    expect(names[0]).toBe('alpha onboarding');
    expect(names.indexOf('alpha onboarding template')).toBeLessThan(names.indexOf('Batch 00'));
    expect(names[names.length - 1]).toBe('Zebra approval');

    const namedDesc = (await (
      await authed(`${url}/api/processes?sort=name_desc&limit=100`)
    ).json()) as { processes: { name: string }[] };
    expect(namedDesc.processes[0]?.name).toBe('Zebra approval');
    expect(namedDesc.processes.at(-1)?.name).toBe('alpha onboarding');

    const oldest = (await (
      await authed(`${url}/api/processes?sort=updated_asc&limit=100`)
    ).json()) as { processes: { id: string }[] };
    expect(oldest.processes[0]?.id).toBe(zebra.process.id);

    const badKind = await authed(`${url}/api/processes?kind=draft`);
    expect(badKind.status).toBe(400);
    const badLimit = await authed(`${url}/api/processes?limit=101`);
    expect(badLimit.status).toBe(400);
  });

  it('searches Cyrillic names and descriptions case-insensitively in sqlite', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);
    const registration = await postProcess(
      url,
      'Базовая Регистрация',
      'Создать учётную запись и подтвердить почту',
    );

    const byName = (await (
      await authed(`${url}/api/processes?q=${encodeURIComponent('регистрация')}`)
    ).json()) as { processes: { id: string }[]; total: number };
    const byDescription = (await (
      await authed(`${url}/api/processes?q=${encodeURIComponent('УЧЁТНУЮ')}`)
    ).json()) as { processes: { id: string }[]; total: number };

    expect(byName.total).toBe(1);
    expect(byName.processes[0]?.id).toBe(registration.process.id);
    expect(byDescription.total).toBe(1);
    expect(byDescription.processes[0]?.id).toBe(registration.process.id);
  });

  it('lints canonical XML and builds previews for legacy rows without workflow JSON', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);
    const db = getQueryDb();
    const table = getProcessesTable();
    const now = '2026-08-22T00:00:00.000Z';
    const boundaryXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_Boundary">
  <bpmn:process id="Process_Boundary" isExecutable="false">
    <bpmn:startEvent id="Start" name="Start" />
    <bpmn:userTask id="Review" name="Review" />
    <bpmn:boundaryEvent id="Timeout" name="Timeout" attachedToRef="Review">
      <bpmn:timerEventDefinition />
    </bpmn:boundaryEvent>
    <bpmn:endEvent id="Done" name="Done" />
    <bpmn:endEvent id="Escalated" name="Escalated" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start" targetRef="Review" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Review" targetRef="Done" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Timeout" targetRef="Escalated" />
  </bpmn:process>
</bpmn:definitions>`;
    const lossyWorkflowJson = JSON.stringify({
      processId: 'Process_Boundary',
      nodes: [
        { id: 'Start', type: 'startEvent', label: 'Start' },
        { id: 'Review', type: 'userTask', label: 'Review' },
        { id: 'Timeout', type: 'task', label: 'Timeout' },
        { id: 'Done', type: 'endEvent', label: 'Done' },
        { id: 'Escalated', type: 'endEvent', label: 'Escalated' },
      ],
      edges: [
        { id: 'Flow_1', source: 'Start', target: 'Review' },
        { id: 'Flow_2', source: 'Review', target: 'Done' },
        { id: 'Flow_3', source: 'Timeout', target: 'Escalated' },
      ],
    });
    await db.insert(table).values([
      {
        id: 'boundary-process',
        userId: testUserId,
        name: 'Boundary process',
        description: null,
        status: 'draft',
        bpmnXml: boundaryXml,
        workflowJson: lossyWorkflowJson,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'legacy-no-workflow',
        userId: testUserId,
        name: 'Legacy process',
        description: null,
        status: 'draft',
        bpmnXml: DEFAULT_BPMN_XML,
        workflowJson: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const response = await authed(`${url}/api/processes?kind=process&limit=20`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      processes: Array<{
        id: string;
        structure: string;
        quality: { errors: number; warnings: number; style: number };
        preview: { nodes: unknown[]; edges: unknown[] };
      }>;
    };
    const expectedQuality = lintProcess(boundaryXml, {
      executionProfile: DEFAULT_EXECUTION_PROFILE,
    });
    expect(body.processes.find((process) => process.id === 'boundary-process')?.quality).toEqual({
      errors: expectedQuality.errors.length,
      warnings: expectedQuality.warnings.length,
      style: expectedQuality.style.length,
      ...(expectedQuality.suggestions.length ? { suggestions: expectedQuality.suggestions.length } : {}),
    });
    const legacy = body.processes.find((process) => process.id === 'legacy-no-workflow');
    expect(legacy?.structure).not.toBe('Empty process');
    expect(legacy?.preview.nodes.length).toBeGreaterThan(0);
    expect(legacy?.preview.edges.length).toBeGreaterThan(0);
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
    cookie = (await issueTestSession()).cookie;
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
    return authed(`${url}/api/processes`, {
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
    cookie = (await issueTestSession()).cookie;
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
    const created = await authed(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'n'.repeat(201) }),
    });
    expect(created.status).toBe(400);
  });

  it('returns 409 when PATCH uses a stale version', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);
    const created = await authed(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Lock' }),
    });
    const { process } = (await created.json()) as { process: { id: string; version: number } };
    const first = await authed(`${url}/api/processes/${process.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'One', version: process.version }),
    });
    expect(first.status).toBe(200);
    const second = await authed(`${url}/api/processes/${process.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Two', version: process.version }),
    });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: string; currentVersion: number };
    expect(body.currentVersion).toBe(2);
  });

  it('allows exactly one concurrent writer for the same version', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);
    const created = await authed(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Concurrent lock' }),
    });
    const { process } = (await created.json()) as { process: { id: string; version: number } };

    const writes = await Promise.all([
      authed(`${url}/api/processes/${process.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Writer A', version: process.version }),
      }),
      authed(`${url}/api/processes/${process.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Writer B', version: process.version }),
      }),
    ]);

    expect(writes.map((response) => response.status).sort()).toEqual([200, 409]);
    const stored = await authed(`${url}/api/processes/${process.id}`);
    expect(stored.status).toBe(200);
    const body = (await stored.json()) as { process: { name: string; version: number } };
    expect(['Writer A', 'Writer B']).toContain(body.process.name);
    expect(body.process.version).toBe(process.version + 1);
  });

  it('deletes a process and 404s the second delete', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);
    const created = await authed(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Gone' }),
    });
    const { process } = (await created.json()) as { process: { id: string } };
    const deleted = await authed(`${url}/api/processes/${process.id}`, { method: 'DELETE' });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ deleted: true, id: process.id });
    const again = await authed(`${url}/api/processes/${process.id}`, { method: 'DELETE' });
    expect(again.status).toBe(404);
    const missing = await authed(`${url}/api/processes/not-a-process`, { method: 'DELETE' });
    expect(missing.status).toBe(404);
  });

  it('returns JSON 400 for malformed JSON and JSON 404 for unknown /api', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);
    const bad = await authed(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(bad.status).toBe(400);
    expect(bad.headers.get('content-type')).toMatch(/json/);
    const body = (await bad.json()) as { error: string };
    expect(body.error).toBe('invalid JSON');
    expect(JSON.stringify(body)).not.toMatch(/JSON\.parse|damashkevich/);
    const unknown = await authed(`${url}/api/nope`);
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get('content-type')).toMatch(/json/);
  });
});
