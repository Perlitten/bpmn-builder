import { describe, expect, it } from 'vitest';
import { createAssistantRequestGate } from './requestGate.js';

describe('assistant request gate', () => {
  it('limits concurrency per user and releases exactly once', () => {
    const gate = createAssistantRequestGate({
      ASSISTANT_MAX_CONCURRENT_PER_USER: '1',
      ASSISTANT_REQUESTS_PER_MINUTE: '10',
    });
    const first = gate.acquire('user-a', 1_000);
    expect(first.ok).toBe(true);
    expect(gate.acquire('user-a', 1_001)).toMatchObject({ ok: false, retryAfterSeconds: 1 });
    expect(gate.acquire('user-b', 1_001).ok).toBe(true);
    if (first.ok) {
      first.release();
      first.release();
    }
    expect(gate.acquire('user-a', 1_002).ok).toBe(true);
  });

  it('enforces the configured rolling per-user quota', () => {
    const gate = createAssistantRequestGate({
      ASSISTANT_MAX_CONCURRENT_PER_USER: '2',
      ASSISTANT_REQUESTS_PER_MINUTE: '2',
    });
    const first = gate.acquire('user-a', 5_000);
    const second = gate.acquire('user-a', 5_001);
    if (first.ok) first.release();
    if (second.ok) second.release();
    expect(gate.acquire('user-a', 5_002)).toMatchObject({ ok: false, retryAfterSeconds: 60 });
    expect(gate.acquire('user-a', 65_001).ok).toBe(true);
  });

  it('prunes idle records without dropping active leases', () => {
    const gate = createAssistantRequestGate({
      ASSISTANT_MAX_CONCURRENT_PER_USER: '1',
      ASSISTANT_REQUESTS_PER_MINUTE: '10',
    });
    const active = gate.acquire('active', 1);
    expect(active.ok).toBe(true);
    if (!active.ok) return;

    for (let i = 0; i < 62; i += 1) {
      const idle = gate.acquire(`idle-${i}`, 1);
      if (idle.ok) idle.release();
    }

    const trigger = gate.acquire('trigger', 60_002);
    if (trigger.ok) trigger.release();
    expect(gate.acquire('active', 60_003)).toMatchObject({ ok: false, retryAfterSeconds: 1 });
    active.release();
    expect(gate.acquire('active', 60_004).ok).toBe(true);
  });
});
