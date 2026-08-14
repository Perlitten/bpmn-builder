import { PROCESS_NAME_MAX } from './validation/validateProcess.js';

export function copyProcessName(name: string): string {
  const trimmed = name.trim() || 'Untitled process';
  const suffix = ' (copy)';
  if (trimmed.length + suffix.length <= PROCESS_NAME_MAX) return `${trimmed}${suffix}`;
  const kept = trimmed.slice(0, Math.max(1, PROCESS_NAME_MAX - suffix.length)).trimEnd();
  return `${kept}${suffix}`.slice(0, PROCESS_NAME_MAX);
}
