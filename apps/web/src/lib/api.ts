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

export type FeedbackCategory = 'general' | 'bug' | 'idea' | 'ux' | 'question';

export type FeedbackItem = {
  id: string;
  category: FeedbackCategory;
  message: string;
  page: string | null;
  processId: string | null;
  status: 'new' | 'reviewed' | 'resolved';
  createdAt: string;
  updatedAt: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly currentVersion?: number;
  constructor(message: string, status: number, body?: Record<string, unknown>) {
    super(message);
    this.status = status;
    const currentVersion = body?.currentVersion;
    if (typeof currentVersion === 'number') this.currentVersion = currentVersion;
  }
}

type ApiClient = {
  listProcesses: (params?: ProcessListParams, signal?: AbortSignal) => Promise<ProcessListResponse>;
  listTemplates: (
    params?: Omit<ProcessListParams, 'kind'>,
    signal?: AbortSignal,
  ) => Promise<ProcessListResponse>;
  createProcess: (input: {
    name: string;
    description?: string;
    templateId?: string;
    bpmnXml?: string;
  }, signal?: AbortSignal) => Promise<{ id: string }>;
  renameProcess: (id: string, name: string, version: number, signal?: AbortSignal) => Promise<Process>;
  duplicateProcess: (id: string, name?: string, signal?: AbortSignal) => Promise<{ id: string }>;
  deleteProcess: (id: string, signal?: AbortSignal) => Promise<void>;
  sendFeedback: (input: {
    category: FeedbackCategory;
    message: string;
    page?: string;
    processId?: string;
  }, signal?: AbortSignal) => Promise<FeedbackItem>;
  listFeedback: (signal?: AbortSignal) => Promise<FeedbackItem[]>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers, ...rest } = init ?? {};
  const method = (rest.method ?? 'GET').toUpperCase();
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/json');
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) requestHeaders.set('X-BPMN-CSRF', '1');
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...rest,
    headers: requestHeaders,
  });
  if (response.status === 401 && !path.startsWith('/api/auth')) {
    window.dispatchEvent(new Event('bpmn:unauthorized'));
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error || `Request failed: ${response.status}`, response.status, body);
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
  listTemplates: async (params = {}, signal) => {
    const search = new URLSearchParams();
    if (params.q?.trim()) search.set('q', params.q.trim());
    if (params.sort) search.set('sort', params.sort);
    if (params.page != null) search.set('page', String(params.page));
    if (params.limit != null) search.set('limit', String(params.limit));
    const qs = search.toString();
    const data = await request<{
      templates: ProcessSummary[];
      total: number;
      page: number;
      limit: number;
    }>(`/api/templates${qs ? `?${qs}` : ''}`, { signal });
    return {
      processes: data.templates,
      total: data.total,
      page: data.page,
      limit: data.limit,
    };
  },
  createProcess: async (input, signal) => {
    const data = await request<{ process: { id: string } }>('/api/processes', {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    });
    return data.process;
  },
  renameProcess: async (id, name, version, signal) => {
    const data = await request<{ process: Process }>(`/api/processes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, version }),
      signal,
    });
    return data.process;
  },
  duplicateProcess: async (id, name, signal) => {
    const data = await request<{ process: { id: string; name: string; version: number } }>(
      `/api/processes/${id}/duplicate`,
      {
        method: 'POST',
        body: JSON.stringify(name !== undefined ? { name } : {}),
        signal,
      },
    );
    const process = data.process;
    const trimmed = name?.trim();
    if (!trimmed || process.name === trimmed) return process;
    const renamed = await request<{ process: { id: string } }>(`/api/processes/${process.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: trimmed, version: process.version }),
      signal,
    });
    return renamed.process;
  },
  deleteProcess: async (id, signal) => {
    await request<{ deleted: true; id: string }>(`/api/processes/${id}`, {
      method: 'DELETE',
      signal,
    });
  },
  sendFeedback: async (input, signal) => {
    const data = await request<{ feedback: FeedbackItem }>('/api/feedback', {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    });
    return data.feedback;
  },
  listFeedback: async (signal) => {
    const data = await request<{ feedback: FeedbackItem[] }>('/api/feedback', { signal });
    return data.feedback;
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
