import { isUpstreamError } from './errors.js';
import {
  assistantTimeoutError,
  assistantTimeoutMs,
  assistantUpstreamError,
  connectGateFailed,
  createConnectGate,
  isTimeoutError,
  whenAborted,
} from './timeout.js';
import type { GenerateJsonInput } from './types.js';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

type NvidiaResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

type NvidiaStreamDelta = { content?: string | null };

const parseJson = (value: string): unknown => {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned || '{}');
};

const readStream = async (response: Response, signal: AbortSignal): Promise<NvidiaResponse> => {
  if (!response.body) throw new Error('NVIDIA API returned an empty stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';

  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  if (signal.aborted) {
    cancel();
    throw signal.reason ?? assistantTimeoutError();
  }
  signal.addEventListener('abort', cancel, { once: true });
  const stop = whenAborted(signal);
  void stop.catch(() => undefined);

  const consume = (block: string) => {
    const data = block.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim();
    if (!data || data === '[DONE]') return;
    const payload = JSON.parse(data) as { choices?: Array<{ delta?: NvidiaStreamDelta }> };
    if (payload.choices?.[0]?.delta?.content) content += payload.choices[0].delta.content;
  };

  try {
    while (true) {
      if (signal.aborted) throw signal.reason ?? assistantTimeoutError();
      const { done, value } = await Promise.race([reader.read(), stop]);
      if (signal.aborted) throw signal.reason ?? assistantTimeoutError();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      blocks.forEach(consume);
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    return { choices: [{ message: { content } }] };
  } catch (error) {
    if (signal.aborted) throw signal.reason ?? assistantTimeoutError();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
};

const samplingFor = (model: string) => {
  if (model.includes('nemotron-3-nano')) {
    return { temperature: 0.6, top_p: 0.95, chat_template_kwargs: { enable_thinking: false } };
  }
  if (model.includes('nemotron-3-super') || model.includes('nemotron-3-ultra')) {
    return { temperature: 1, top_p: 0.95, chat_template_kwargs: { enable_thinking: false } };
  }
  return { temperature: 0.3 };
};

export function createNvidiaClient(apiKey: string, model: string) {
  const sampling = samplingFor(model);

  const request = async (body: Record<string, unknown>, signal?: AbortSignal): Promise<NvidiaResponse> => {
    const deadline = signal ?? AbortSignal.timeout(assistantTimeoutMs());
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (deadline.aborted) throw deadline.reason ?? assistantTimeoutError();
      const gate = createConnectGate(deadline);
      const stop = whenAborted(gate.signal);
      void stop.catch(() => undefined);
      try {
        const response = await Promise.race([
          fetch(`${process.env.NVIDIA_BASE_URL || NVIDIA_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ model, ...body, stream: true }),
            signal: gate.signal,
          }),
          stop,
        ]);
        gate.headersArrived();
        if (response.ok) return await readStream(response, deadline);
        const payload = (await response.json()) as NvidiaResponse;
        const retryable = response.status >= 500 && attempt === 0 && !deadline.aborted;
        if (!retryable) {
          throw new Error(`NVIDIA API ${response.status}: ${payload.error?.message || 'Request failed'}`);
        }
      } catch (error) {
        if (deadline.aborted) throw deadline.reason ?? assistantTimeoutError();
        if (isUpstreamError(error) || connectGateFailed(gate, deadline)) throw assistantUpstreamError();
        if (isTimeoutError(error) || attempt === 1) throw error;
      } finally {
        gate.dispose();
      }
    }
    throw new Error('NVIDIA API request failed after retry.');
  };

  return {
    provider: 'nvidia' as const,
    model,
    async generateJson(input: GenerateJsonInput): Promise<unknown> {
      const payload = await request(
        {
          messages: [
            { role: 'system', content: `${input.systemInstruction}\nReturn only valid JSON without Markdown fences.` },
            { role: 'user', content: input.prompt },
          ],
          ...sampling,
          temperature: input.temperature ?? sampling.temperature,
          response_format: { type: 'json_object' },
          max_tokens: 8192,
        },
        input.signal,
      );
      return parseJson(payload.choices?.[0]?.message?.content || '{}');
    },
  };
}
