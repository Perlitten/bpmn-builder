import http from 'node:http';
import express from 'express';
import { executePlan } from '@bpmn/agent-tools';
import { createProcess, setBranchLocked } from '@bpmn/semantic-core';
import { afterEach, describe, expect, it } from 'vitest';
import { registerAssistantRoutes } from './assistant.js';

const listen = (handler: http.RequestListener) =>
  new Promise<{ server: http.Server; url: string }>((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('no port');
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });

describe('assistant routes', () => {
  const snapshot = { ...process.env };
  const servers: http.Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  it('returns 400 when message and tools are missing', async () => {
    process.env.AI_PROVIDER = 'nvidia';
    process.env.NVIDIA_API_KEY = 'nvapi-test';
    process.env.LLM_MODEL = 'nvidia/nemotron-3-super-120b-a12b';
    const app = express();
    app.use(express.json());
    registerAssistantRoutes(app, () => {
      throw new Error('should not call the model');
    });
    const { server, url } = await listen(app);
    servers.push(server);
    const response = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });

  it('returns 503 when the key is not configured and a plan must be proposed', async () => {
    process.env.AI_PROVIDER = 'nvidia';
    delete process.env.NVIDIA_API_KEY;
    process.env.LLM_MODEL = 'nvidia/nemotron-3-super-120b-a12b';
    const app = express();
    app.use(express.json());
    registerAssistantRoutes(app);
    const { server, url } = await listen(app);
    servers.push(server);
    const response = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'add a task' }),
    });
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/not configured/i);
  });

  it('executes a semantic tool plan without an LLM', async () => {
    delete process.env.NVIDIA_API_KEY;
    const app = express();
    app.use(express.json());
    registerAssistantRoutes(app, () => {
      throw new Error('should not call the model');
    });
    const { server, url } = await listen(app);
    servers.push(server);
    const response = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tools: [{ name: 'addAfter', args: { after: 'StartEvent_1', name: 'Review request' } }],
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      data: {
        message: string;
        tools: Array<{ name: string }>;
        results: Array<{ name: string; id: string }>;
        process: { nodes: Array<{ name: string }> };
        bpmnXml?: unknown;
        actions?: unknown;
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.tools[0]?.name).toBe('addAfter');
    expect(body.data.results[0]?.name).toBe('addAfter');
    expect(body.data.process.nodes.some((n) => n.name === 'Review request')).toBe(true);
    expect(body.data).not.toHaveProperty('bpmnXml');
    expect(body.data).not.toHaveProperty('actions');
  });

  it('executes LLM-proposed tools and strips XML', async () => {
    process.env.AI_PROVIDER = 'nvidia';
    process.env.NVIDIA_API_KEY = 'nvapi-test';
    process.env.LLM_MODEL = 'nvidia/nemotron-3-super-120b-a12b';
    const app = express();
    app.use(express.json());
    registerAssistantRoutes(app, () => ({
      provider: 'nvidia',
      model: 'nvidia/nemotron-3-super-120b-a12b',
      generateJson: async () => ({
        message: 'Added a review task.',
        tools: [{ name: 'addTask', args: { name: 'Review request', componentId: 'activity.userTask' } }],
        bpmnXml: '<bpmn:definitions>FAKE</bpmn:definitions>',
      }),
    }));
    const { server, url } = await listen(app);
    servers.push(server);
    const response = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'add a review task' }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; data?: { bpmnXml?: string } };
    expect(body.error).toMatch(/must not emit BPMN XML/i);
    expect(body.data?.bpmnXml).toBeUndefined();
  });

  it('applies LLM tools when the model only proposes names and args', async () => {
    process.env.AI_PROVIDER = 'nvidia';
    process.env.NVIDIA_API_KEY = 'nvapi-test';
    const app = express();
    app.use(express.json());
    registerAssistantRoutes(app, () => ({
      provider: 'nvidia',
      model: 'nvidia/nemotron-3-super-120b-a12b',
      generateJson: async () => ({
        message: 'Added a review task.',
        tools: [{ name: 'addTask', args: { name: 'Review request' } }],
      }),
    }));
    const { server, url } = await listen(app);
    servers.push(server);
    const response = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'add a review task' }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { process: { nodes: Array<{ name: string }> }; bpmnXml?: unknown };
    };
    expect(body.data.process.nodes.some((n) => n.name === 'Review request')).toBe(true);
    expect(body.data).not.toHaveProperty('bpmnXml');
  });

  it('refuses tools that mutate a locked branch or leave the posted scope', async () => {
    delete process.env.NVIDIA_API_KEY;
    const app = express();
    app.use(express.json());
    registerAssistantRoutes(app, () => {
      throw new Error('should not call the model');
    });
    const { server, url } = await listen(app);
    servers.push(server);

    let graph = executePlan(createProcess(), [
      { name: 'addTask', args: { name: 'Review' } },
      { name: 'splitExclusive', args: { after: 'Review', branches: [{ name: 'Yes' }, { name: 'No' }] } },
      { name: 'addTask', args: { name: 'Handle yes', branchId: 'Yes' } },
      { name: 'addTask', args: { name: 'Handle no', branchId: 'No' } },
    ]).process;
    const yes = graph.regions[0]!.branches[0]!;
    const no = graph.regions[0]!.branches[1]!;
    const handleNo = graph.nodes.find((n) => n.name === 'Handle no')!.id;
    graph = setBranchLocked(graph, no.id, true).process;

    const locked = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        process: graph,
        tools: [{ name: 'addAfter', args: { after: handleNo, name: 'Blocked' } }],
      }),
    });
    expect(locked.status).toBe(400);
    expect(((await locked.json()) as { error: string }).error).toMatch(/protected from AI/);

    const outside = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        process: graph,
        scope: { kind: 'branch', id: yes.id },
        tools: [{ name: 'addAfter', args: { after: handleNo, name: 'Blocked' } }],
      }),
    });
    expect(outside.status).toBe(400);
    expect(((await outside.json()) as { error: string }).error).toMatch(/outside agent scope|protected from AI/);

    const inside = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        process: graph,
        scope: { kind: 'branch', id: yes.id },
        tools: [{ name: 'addTask', args: { name: 'More yes' } }],
      }),
    });
    expect(inside.status).toBe(200);
    const body = (await inside.json()) as { data: { process: { nodes: Array<{ name: string }> } } };
    expect(body.data.process.nodes.some((n) => n.name === 'More yes')).toBe(true);

    const regionPin = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        process: graph,
        scope: { kind: 'process' },
        tools: [{ name: 'addTask', args: { name: 'Register customer', branch: graph.regions[0]!.id } }],
      }),
    });
    expect(regionPin.status).toBe(200);
    const pinned = (await regionPin.json()) as { data: { process: { nodes: Array<{ name: string }> } }; error?: string };
    expect(pinned.error).toBeUndefined();
    expect(pinned.data.process.nodes.some((n) => n.name === 'Register customer')).toBe(true);
  });

  it('returns 504 JSON when the model never answers', async () => {
    process.env.AI_PROVIDER = 'nvidia';
    process.env.NVIDIA_API_KEY = 'nvapi-test';
    process.env.ASSISTANT_TIMEOUT_MS = '40';
    const app = express();
    app.use(express.json());
    registerAssistantRoutes(app, () => ({
      provider: 'nvidia',
      model: 'nvidia/nemotron-3-super-120b-a12b',
      generateJson: () => new Promise(() => {}),
    }));
    const { server, url } = await listen(app);
    servers.push(server);
    const started = Date.now();
    const response = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'add a task' }),
    });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(response.status).toBe(504);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/timed out after 40ms/i);
  });

  it('returns 504 when a fake NVIDIA upstream never responds', async () => {
    process.env.AI_PROVIDER = 'nvidia';
    process.env.NVIDIA_API_KEY = 'nvapi-test';
    process.env.ASSISTANT_TIMEOUT_MS = '80';
    process.env.LLM_MODEL = 'nvidia/nemotron-3-super-120b-a12b';
    const upstream = await listen((req) => {
      req.resume();
    });
    servers.push(upstream.server);
    process.env.NVIDIA_BASE_URL = upstream.url;
    const app = express();
    app.use(express.json());
    registerAssistantRoutes(app);
    const { server, url } = await listen(app);
    servers.push(server);
    const started = Date.now();
    const response = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'rename the task' }),
    });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(response.status).toBe(504);
    const text = await response.text();
    expect(text.length).toBeGreaterThan(0);
    expect(JSON.parse(text).error).toMatch(/timed out after 80ms/i);
  });

  it('sends привет to the model instead of a local greeting', async () => {
    process.env.AI_PROVIDER = 'nvidia';
    process.env.NVIDIA_API_KEY = 'nvapi-test';
    let called = 0;
    const app = express();
    app.use(express.json());
    registerAssistantRoutes(app, () => ({
      provider: 'nvidia',
      model: 'nvidia/nemotron-3-super-120b-a12b',
      generateJson: async () => {
        called += 1;
        return { message: 'Hello from the model.', tools: [] };
      },
    }));
    const { server, url } = await listen(app);
    servers.push(server);
    const response = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'привет' }),
    });
    expect(response.status).toBe(200);
    expect(called).toBe(1);
    const body = (await response.json()) as { data: { message: string; tools: unknown[] } };
    expect(body.data.tools).toEqual([]);
    expect(body.data.message).toBe('Hello from the model.');
  });

  it('returns 504 when a greeting hangs on the model', async () => {
    process.env.AI_PROVIDER = 'nvidia';
    process.env.NVIDIA_API_KEY = 'nvapi-test';
    process.env.ASSISTANT_TIMEOUT_MS = '40';
    let called = 0;
    const app = express();
    app.use(express.json());
    registerAssistantRoutes(app, () => ({
      provider: 'nvidia',
      model: 'nvidia/nemotron-3-super-120b-a12b',
      generateJson: () => {
        called += 1;
        return new Promise(() => {});
      },
    }));
    const { server, url } = await listen(app);
    servers.push(server);
    const started = Date.now();
    const response = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'привет' }),
    });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(called).toBe(1);
    expect(response.status).toBe(504);
    expect(((await response.json()) as { error: string }).error).toMatch(/timed out after 40ms/i);
  });

  it('returns 503 for a greeting when AI is not configured', async () => {
    process.env.AI_PROVIDER = 'nvidia';
    delete process.env.NVIDIA_API_KEY;
    const app = express();
    app.use(express.json());
    registerAssistantRoutes(app);
    const { server, url } = await listen(app);
    servers.push(server);
    const started = Date.now();
    const response = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/not configured/i);
  });

  it('returns 502 when the provider is silent', async () => {
    process.env.AI_PROVIDER = 'nvidia';
    process.env.NVIDIA_API_KEY = 'nvapi-test';
    const app = express();
    app.use(express.json());
    registerAssistantRoutes(app, () => ({
      provider: 'nvidia',
      model: 'nvidia/nemotron-3-super-120b-a12b',
      generateJson: async () => {
        const error = new Error('AI provider did not respond. Check the API key and network, then retry.');
        error.name = 'UpstreamError';
        throw error;
      },
    }));
    const { server, url } = await listen(app);
    servers.push(server);
    const response = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'add a task' }),
    });
    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: string }).error).toMatch(/did not respond/i);
  });

  it('returns 400 when posted BPMN XML cannot be read', async () => {
    delete process.env.NVIDIA_API_KEY;
    const app = express();
    app.use(express.json());
    registerAssistantRoutes(app, () => {
      throw new Error('should not call the model');
    });
    const { server, url } = await listen(app);
    servers.push(server);
    const response = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tools: [{ name: 'addTask', args: { name: 'Review' } }],
        bpmnXml: '<not-bpmn>',
      }),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/could not read the posted BPMN XML/i);
  });
});
