import { isToolPlanError, userFacingPlanError } from '../../../agent-tools/src/index.js';
import type { Application, Request, Response } from 'express';
import { friendlyAiError, isConfigError, isUpstreamError } from '../ai/errors.js';
import { getAiClient, getAiProviderInfo } from '../ai/provider.js';
import { runAssistant } from '../ai/runAssistant.js';
import {
  assistantTimeoutError,
  assistantTimeoutMs,
  isTimeoutError,
  whenAborted,
} from '../ai/timeout.js';
import type { AiModelClient, ChatTurn } from '../ai/types.js';

type ClientFactory = () => AiModelClient;

const parseHistory = (value: unknown): ChatTurn[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as { role?: string; text?: string };
    if ((row.role !== 'user' && row.role !== 'assistant') || typeof row.text !== 'string') return [];
    return [{ role: row.role, text: row.text }];
  });
};

function sendJson(res: Response, status: number, body: unknown): void {
  if (res.headersSent || res.writableEnded) return;
  try {
    res.status(status).json(body);
  } catch (error) {
    console.warn('[assistant] failed to write response:', error instanceof Error ? error.message : error);
  }
}

function createAssistantHandler(getClient: ClientFactory = getAiClient) {
  return async (req: Request, res: Response) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const tools = Array.isArray(req.body?.tools) ? req.body.tools : undefined;
    const hasTools = Boolean(tools?.length);
    if (!message && !hasTools) {
      sendJson(res, 400, { error: 'message or tools is required' });
      return;
    }

    const info = getAiProviderInfo();
    if (!hasTools && !info.configured) {
      sendJson(res, 503, {
        error: 'AI agent is not configured. Add the selected provider API key and restart the server.',
        configured: false,
        provider: info.provider,
        model: info.model,
      });
      return;
    }

    const ac = new AbortController();
    const abort = (reason: unknown = assistantTimeoutError()) => {
      if (!ac.signal.aborted) ac.abort(reason);
    };
    const sendTimeout = () => {
      const timeout = assistantTimeoutError();
      abort(timeout);
      if (res.headersSent) return;
      console.warn(`[assistant] ${timeout.message}`);
      sendJson(res, 504, { error: timeout.message });
    };
    const timer = setTimeout(sendTimeout, assistantTimeoutMs());
    const onClose = () => {
      if (!res.writableEnded) abort(Object.assign(new Error('Architect request was cancelled.'), { name: 'AbortError' }));
    };
    res.once('close', onClose);

    const work = runAssistant(hasTools ? null : getClient(), {
      message,
      tools,
      history: parseHistory(req.body?.history),
      processName: typeof req.body?.processName === 'string' ? req.body.processName : undefined,
      process: req.body?.process,
      bpmnXml: typeof req.body?.bpmnXml === 'string' ? req.body.bpmnXml : undefined,
      scope: req.body?.scope,
      signal: ac.signal,
    });
    void work.catch((error) => {
      if (res.headersSent) {
        console.warn('[assistant] upstream after abort:', error instanceof Error ? error.message : error);
      }
    });
    const stop = whenAborted(ac.signal);
    void stop.catch(() => undefined);

    try {
      const data = await Promise.race([work, stop]);
      sendJson(res, 200, { success: true, data });
    } catch (error: unknown) {
      if (res.headersSent) return;
      if (isTimeoutError(error)) {
        console.warn('[assistant] aborted:', error instanceof Error ? `${error.name}: ${error.message}` : error);
        sendTimeout();
        return;
      }
      if (isToolPlanError(error)) {
        sendJson(res, 400, { error: userFacingPlanError(error.message) });
        return;
      }
      if (isUpstreamError(error)) {
        sendJson(res, 502, { error: friendlyAiError(error) });
        return;
      }
      const status = isConfigError(error) ? 503 : 500;
      sendJson(res, status, { error: friendlyAiError(error) });
    } finally {
      clearTimeout(timer);
      res.off('close', onClose);
    }
  };
}

export function registerAssistantRoutes(app: Application, getClient: ClientFactory = getAiClient): void {
  const chat = createAssistantHandler(getClient);
  app.get('/api/ai/status', (_req: Request, res: Response) => {
    res.json(getAiProviderInfo());
  });
  app.post('/api/assistant', chat);
}
