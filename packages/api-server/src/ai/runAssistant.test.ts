import { createProcess } from '@bpmn/semantic-core';
import { describe, expect, it, vi } from 'vitest';
import { runAssistant } from './runAssistant.js';

describe('runAssistant greetings', () => {
  it('returns a short reply without calling the model', async () => {
    const generateJson = vi.fn(() => new Promise(() => {}));
    const started = Date.now();
    const data = await runAssistant(
      { provider: 'nvidia', model: 'test', generateJson },
      { message: 'привет', process: createProcess() },
    );
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(generateJson).not.toHaveBeenCalled();
    expect(data.tools).toEqual([]);
    expect(data.results).toEqual([]);
    expect(data.message).toMatch(/процесс/i);
  });

  it('still requires a configured model for a real edit', async () => {
    await expect(runAssistant(null, { message: 'add a review task', process: createProcess() })).rejects.toThrow(
      /not configured/i,
    );
  });
});
