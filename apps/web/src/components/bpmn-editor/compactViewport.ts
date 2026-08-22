import { useEffect, useState } from 'react';
import { COMPACT_MAX_WIDTH, isCompactViewport } from './layoutMetrics';

export { COMPACT_MAX_WIDTH, isCompactViewport };

const COMPACT_MQ = `(max-width: ${COMPACT_MAX_WIDTH}px)`;

export function useCompactViewport(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(COMPACT_MQ).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(COMPACT_MQ);
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return compact;
}
