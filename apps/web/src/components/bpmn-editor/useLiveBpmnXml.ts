import { useCallback, useEffect, useRef, useState } from 'react';
import { usableXml } from './usableXml';

/** Keeps editor-derived XML authoritative while persistence catches up asynchronously. */
export function useLiveBpmnXml(identity: string, initialXml: string, onChange?: (xml: string) => void) {
  const onChangeRef = useRef(onChange);
  const xmlRef = useRef(initialXml);
  const [currentXml, setCurrentXml] = useState(() => usableXml(initialXml));
  const [revision, setRevision] = useState(0);
  onChangeRef.current = onChange;

  useEffect(() => {
    xmlRef.current = initialXml;
    setCurrentXml(usableXml(initialXml));
    setRevision((value) => value + 1);
  }, [identity, initialXml]);

  const emit = useCallback((next: string) => {
    xmlRef.current = next;
    setCurrentXml(next);
    setRevision((value) => value + 1);
    onChangeRef.current?.(next);
  }, []);

  return { xmlRef, currentXml, revision, emit };
}
