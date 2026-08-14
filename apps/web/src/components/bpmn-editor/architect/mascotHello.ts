import { useEffect, useRef, useState } from 'react';
import type { MascotMood } from './mascotMood';

export const HELLO_MS = 1800;

export function canMascotGreet(mood: MascotMood, reducedMotion: boolean): boolean {
  void reducedMotion;
  return mood === 'hover';
}

/** Say Hello once per pointer entry. Leaving cancels it; idle and success stay quiet. */
export function useMascotHello(mood: MascotMood): boolean {
  const [hello, setHello] = useState(false);
  const hideRef = useRef(0);

  useEffect(() => {
    window.clearTimeout(hideRef.current);
    if (!canMascotGreet(mood, false)) {
      setHello(false);
      return;
    }
    setHello(true);
    hideRef.current = window.setTimeout(() => setHello(false), HELLO_MS);
  }, [mood]);

  useEffect(() => () => window.clearTimeout(hideRef.current), []);

  return hello;
}
