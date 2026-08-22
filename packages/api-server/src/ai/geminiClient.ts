import { isUpstreamError } from './errors.js';
import { assistantTimeoutMs, assistantUpstreamError, isTimeoutError } from './timeout.js';
import type { GenerateJsonInput } from './types.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
const MAX_OUTPUT_TOKENS = 32768;

export function geminiMaxOutputTokens(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.GEMINI_MAX_OUTPUT_TOKENS);
  if (!Number.isInteger(value) || value < 256) return DEFAULT_MAX_OUTPUT_TOKENS;
  return Math.min(value, MAX_OUTPUT_TOKENS);
}

export function createGeminiClient(apiKey: string, model: string) {
  return {
    provider: 'gemini' as const,
    model,
    async generateJson(input: GenerateJsonInput): Promise<unknown> {
      try {
        const response = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
            generationConfig: {
              temperature: input.temperature ?? 0.3,
              responseMimeType: 'application/json',
              maxOutputTokens: geminiMaxOutputTokens(),
            },
          }),
          signal: input.signal ?? AbortSignal.timeout(assistantTimeoutMs()),
        });
        const payload = (await response.json()) as {
          error?: { message?: string };
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        if (!response.ok) {
          throw new Error(`Gemini API ${response.status}: ${payload.error?.message || 'Request failed'}`);
        }
        const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}';
        const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        return JSON.parse(cleaned || '{}');
      } catch (error) {
        if (isTimeoutError(error)) throw error;
        if (isUpstreamError(error)) throw assistantUpstreamError();
        throw error;
      }
    },
  };
}
