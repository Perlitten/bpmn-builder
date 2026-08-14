import { createGeminiClient } from './geminiClient.js';
import { createNvidiaClient } from './nvidiaClient.js';
import type { AiModelClient, AiProviderInfo } from './types.js';

const DEFAULT_NVIDIA_MODEL = 'meta/llama-3.3-70b-instruct';
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-pro-preview';

const preferredProvider = () => process.env.AI_PROVIDER?.trim().toLowerCase();

const llmModel = () => process.env.LLM_MODEL?.trim();

export function getAiProviderInfo(): AiProviderInfo {
  const preferred = preferredProvider();
  const nvidiaKey = Boolean(process.env.NVIDIA_API_KEY?.trim());
  const geminiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  if (preferred === 'nvidia' || (!preferred && nvidiaKey)) {
    return {
      configured: nvidiaKey,
      provider: 'nvidia',
      model: llmModel() || process.env.NVIDIA_MODEL?.trim() || DEFAULT_NVIDIA_MODEL,
    };
  }
  return {
    configured: geminiKey,
    provider: 'gemini',
    model: llmModel() || process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
  };
}

export function getAiClient(): AiModelClient {
  const info = getAiProviderInfo();
  if (info.provider === 'nvidia') {
    const apiKey = process.env.NVIDIA_API_KEY?.trim();
    if (!apiKey) throw new Error('NVIDIA_API_KEY environment variable is not configured.');
    return createNvidiaClient(apiKey, info.model);
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not configured.');
  return createGeminiClient(apiKey, info.model);
}
