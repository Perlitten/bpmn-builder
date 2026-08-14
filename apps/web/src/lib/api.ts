import type { AgentScope } from '@bpmn/agent-tools';
import type { Process, ProcessPatch, ProcessSummary } from '@bpmn/domain';
import type { AppRoute } from '../routes/types';

export type ProcessListKind = 'all' | 'process' | 'template';
export type ProcessListSort = 'updated_desc' | 'updated_asc' | 'name_asc' | 'name_desc';

export type ProcessListParams = {
  q?: string;
  kind?: ProcessListKind;
  sort?: ProcessListSort;
  page?: number;
  limit?: number;
};

export type ProcessListResponse = {
  processes: ProcessSummary[];
  total: number;
  page: number;
  limit: number;
};

type ApiClient = {
  listProcesses: (params?: ProcessListParams, signal?: AbortSignal) => Promise<ProcessListResponse>;
  listTemplates: (signal?: AbortSignal) => Promise<ProcessSummary[]>;
  createProcess: (input: {
    name: string;
    description?: string;
    templateId?: string;
    bpmnXml?: string;
  }, signal?: AbortSignal) => Promise<{ id: string }>;
  renameProcess: (id: string, name: string, signal?: AbortSignal) => Promise<Process>;
  deleteProcess: (id: string, signal?: AbortSignal) => Promise<void>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api: ApiClient = {
  listProcesses: async (params = {}, signal) => {
    const search = new URLSearchParams();
    if (params.q?.trim()) search.set('q', params.q.trim());
    if (params.kind) search.set('kind', params.kind);
    if (params.sort) search.set('sort', params.sort);
    if (params.page != null) search.set('page', String(params.page));
    if (params.limit != null) search.set('limit', String(params.limit));
    const qs = search.toString();
    return request<ProcessListResponse>(`/api/processes${qs ? `?${qs}` : ''}`, { signal });
  },
  listTemplates: async (signal) => {
    const data = await request<{ templates: ProcessSummary[] }>('/api/templates', { signal });
    return data.templates;
  },
  createProcess: async (input, signal) => {
    const data = await request<{ process: { id: string } }>('/api/processes', {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    });
    return data.process;
  },
  renameProcess: async (id, name, signal) => {
    const data = await request<{ process: Process }>(`/api/processes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
      signal,
    });
    return data.process;
  },
  deleteProcess: async (id, signal) => {
    await request<{ deleted: true; id: string }>(`/api/processes/${id}`, {
      method: 'DELETE',
      signal,
    });
  },
};

export async function fetchProcess(processId: string) {
  return request<{ process: Process }>(`/api/processes/${processId}`);
}

export async function saveProcess(processId: string, patch: ProcessPatch) {
  return request<{ process: Process }>(`/api/processes/${processId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function saveAsTemplate(processId: string, bpmnXml?: string) {
  return request<{ process: Process }>(`/api/processes/${processId}/template`, {
    method: 'POST',
    body: JSON.stringify(bpmnXml ? { bpmnXml } : {}),
  });
}

export type ChatTurn = { role: 'user' | 'assistant'; text: string };

export type AiStatus = {
  configured: boolean;
  provider: string;
  model: string;
};

export type AssistantResponse = {
  message: string;
  tools: Array<{ name: string; args: Record<string, unknown> }>;
  results: Array<{ name: string; args: Record<string, unknown>; id: string; view?: unknown }>;
  process: unknown;
  previousProcess?: unknown;
};

export async function fetchAiStatus(signal?: AbortSignal): Promise<AiStatus> {
  return request<AiStatus>('/api/ai/status', { signal });
}

export async function runAssistant(input: {
  message: string;
  process: unknown;
  processName?: string;
  history?: ChatTurn[];
  scope?: AgentScope;
  signal?: AbortSignal;
}): Promise<AssistantResponse> {
  const body = await request<{ success: boolean; data: AssistantResponse }>('/api/assistant', {
    method: 'POST',
    body: JSON.stringify({
      message: input.message,
      process: input.process,
      processName: input.processName,
      history: input.history,
      scope: input.scope,
    }),
    signal: input.signal,
  });
  return body.data;
}

export type { AppRoute };
