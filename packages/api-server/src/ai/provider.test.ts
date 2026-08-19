import { afterEach, describe, expect, it } from 'vitest';
import { getAiProviderInfo } from './provider.js';

describe('AI provider selection', () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  it('prefers LLM_MODEL for NVIDIA', () => {
    process.env.AI_PROVIDER = 'nvidia';
    process.env.NVIDIA_API_KEY = 'nvapi-test';
    process.env.NVIDIA_MODEL = 'nvidia/nemotron-3-nano-30b-a3b';
    process.env.LLM_MODEL = 'nvidia/nemotron-3-super-120b-a12b';
    const info = getAiProviderInfo();
    expect(info.provider).toBe('nvidia');
    expect(info.configured).toBe(true);
    expect(info.model).toBe('nvidia/nemotron-3-super-120b-a12b');
  });

  it('reports unconfigured when the NVIDIA key is missing', () => {
    process.env.AI_PROVIDER = 'nvidia';
    delete process.env.NVIDIA_API_KEY;
    process.env.LLM_MODEL = 'nvidia/nemotron-3-super-120b-a12b';
    expect(getAiProviderInfo().configured).toBe(false);
  });
});
