export type MascotMood = 'idle' | 'hover' | 'thinking' | 'success' | 'error';

export function resolveMascotMood(state: {
  busy?: boolean;
  error?: boolean;
  success?: boolean;
  hover?: boolean;
}): MascotMood {
  if (state.busy) return 'thinking';
  if (state.error) return 'error';
  if (state.success) return 'success';
  if (state.hover) return 'hover';
  return 'idle';
}
