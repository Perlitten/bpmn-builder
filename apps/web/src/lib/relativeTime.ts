const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const absoluteDate = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });

let currentNow = Date.now();
let ticker: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

export function subscribeRelativeTime(listener: () => void): () => void {
  listeners.add(listener);
  if (!ticker) {
    currentNow = Date.now();
    ticker = setInterval(() => {
      currentNow = Date.now();
      for (const notify of listeners) notify();
    }, MINUTE);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

export function relativeTimeSnapshot(): number {
  return currentNow;
}

export function relativeTimeServerSnapshot(): number {
  return currentNow;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return 'Unknown time';
  const delta = now - timestamp;
  if (delta < 0) {
    const ahead = -delta;
    if (ahead < MINUTE) return 'In a moment';
    if (ahead < HOUR) return `in ${Math.ceil(ahead / MINUTE)}m`;
    if (ahead < DAY) return `in ${Math.ceil(ahead / HOUR)}h`;
    if (ahead < 7 * DAY) return `in ${Math.ceil(ahead / DAY)}d`;
    return absoluteDate.format(timestamp);
  }
  if (delta < MINUTE) return 'Just now';
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`;
  if (delta < 7 * DAY) return `${Math.floor(delta / DAY)}d ago`;
  return absoluteDate.format(timestamp);
}

export function absoluteTime(iso: string): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return 'Invalid timestamp';
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZoneName: 'short',
    year: 'numeric',
  }).format(timestamp);
}
