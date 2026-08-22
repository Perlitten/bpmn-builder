import { createProcess } from '@bpmn/semantic-core';
import { describe, expect, it, vi } from 'vitest';
import { runAssistant } from './runAssistant.js';

describe('runAssistant greetings', () => {
  it('sends привет through the model like any other message', async () => {
    const generateJson = vi.fn(async () => ({
      message: 'Hello. Say what to add, split, or rename.',
      tools: [],
    }));
    const data = await runAssistant(
      { provider: 'nvidia', model: 'test', generateJson },
      { message: 'привет', process: createProcess() },
    );
    expect(generateJson).toHaveBeenCalledOnce();
    expect(data.tools).toEqual([]);
    expect(data.results).toEqual([]);
    expect(data.message).toMatch(/hello|add|split|rename/i);
  });

  it('does not present stale action prose as a successful edit when no tool ran', async () => {
    const data = await runAssistant(
      {
        provider: 'nvidia',
        model: 'test',
        generateJson: vi.fn(async () => ({
          message: 'Added a review task after Check.',
          tools: [],
        })),
      },
      { message: 'abracadabra', process: createProcess() },
    );
    expect(data.tools).toEqual([]);
    expect(data.results).toEqual([]);
    expect(data.message).toMatch(/couldn't map|describe/i);
    expect(data.message).not.toMatch(/added a review task/i);
  });

  it('still requires a configured model for a greeting or a real edit', async () => {
    await expect(runAssistant(null, { message: 'привет', process: createProcess() })).rejects.toThrow(
      /not configured/i,
    );
    await expect(runAssistant(null, { message: 'add a review task', process: createProcess() })).rejects.toThrow(
      /not configured/i,
    );
  });
});

describe('runAssistant catalog leak', () => {
  it('does not leak catalog census or start an unsolicited pool', async () => {
    const generateJson = vi.fn(async (input: { systemInstruction: string }) => {
      expect(input.systemInstruction).not.toContain('72');
      expect(input.systemInstruction).not.toContain('Not in modeling profile yet');
      return {
        message:
          'Каталог собран: реально доступно ~22 компонента из ~72 — остальные помечены Not in modeling profile yet. Строю из того, что есть. Начинаю с пула.',
        tools: [
          { name: 'addPool', args: { name: 'Partner' } },
          { name: 'addTask', args: { name: 'Register' } },
        ],
      };
    });
    const origin = createProcess();
    const data = await runAssistant(
      { provider: 'nvidia', model: 'test', generateJson },
      { message: 'registration flow', process: origin },
    );
    expect(data.message).not.toMatch(/72|Not in modeling profile yet|Каталог собран/i);
    expect(data.tools.map((tool) => tool.name)).toEqual(['addTask']);
    expect(data.process.participants ?? []).toEqual(origin.participants ?? []);
    expect(data.process.nodes.some((node) => node.name === 'Register')).toBe(true);
  });

  it('keeps addPool when the user asked for a partner pool', async () => {
    const generateJson = vi.fn(async () => ({
      message: 'Added a Bank pool.',
      tools: [{ name: 'addPool', args: { name: 'Bank' } }],
    }));
    const data = await runAssistant(
      { provider: 'nvidia', model: 'test', generateJson },
      { message: 'add a pool for the bank', process: createProcess() },
    );
    expect(data.tools.map((tool) => tool.name)).toEqual(['addPool']);
    expect(data.process.participants).toHaveLength(2);
    expect(data.message).toBe('Added a Bank pool.');
  });
});
