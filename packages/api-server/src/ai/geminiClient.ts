import { assistantTimeoutMs } from './timeout.js';
import type { GenerateJsonInput } from './types.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function createGeminiClient(apiKey: string, model: string) {
  return {
    provider: 'gemini' as const,
    model,
    async generateJson(input: GenerateJsonInput): Promise<unknown> {
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
            maxOutputTokens: 8192,
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
    },
  };
}
