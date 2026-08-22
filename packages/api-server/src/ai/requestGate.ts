type GateRecord = {
  inFlight: number;
  requests: number[];
};

type GateLease =
  | { ok: true; release: () => void }
  | { ok: false; retryAfterSeconds: number };

function positiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

/** Per-instance backpressure. A shared edge/WAF limit remains required across serverless instances. */
export function createAssistantRequestGate(env: NodeJS.ProcessEnv = process.env) {
  const maxConcurrent = positiveInt(env.ASSISTANT_MAX_CONCURRENT_PER_USER, 2, 10);
  const maxRequests = positiveInt(env.ASSISTANT_REQUESTS_PER_MINUTE, 30, 300);
  const windowMs = 60_000;
  const records = new Map<string, GateRecord>();

  const acquire = (key: string, now = Date.now()): GateLease => {
    const cutoff = now - windowMs;
    // A long-lived Node instance can see many one-off users. Evict idle
    // records whose sliding window is over before accepting a new lease.
    if (records.size > 1_000) {
      let checked = 0;
      for (const [knownKey, known] of records) {
        if (known.inFlight === 0 && known.requests.every((time) => time <= cutoff)) records.delete(knownKey);
        checked += 1;
        if (checked >= 64) break;
      }
    }
    const record = records.get(key) ?? { inFlight: 0, requests: [] };
    record.requests = record.requests.filter((time) => time > cutoff);
    records.set(key, record);

    if (record.inFlight >= maxConcurrent) return { ok: false, retryAfterSeconds: 1 };
    if (record.requests.length >= maxRequests) {
      const retryMs = Math.max(1_000, (record.requests[0] ?? now) + windowMs - now);
      return { ok: false, retryAfterSeconds: Math.ceil(retryMs / 1_000) };
    }

    record.inFlight += 1;
    record.requests.push(now);
    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        record.inFlight = Math.max(0, record.inFlight - 1);
      },
    };
  };

  return { acquire };
}
