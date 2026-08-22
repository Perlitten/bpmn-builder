declare const __APP_VERSION__: string;
declare const __COMMIT_SHA__: string | undefined;

export function resolveCommitSha(sha?: string): string {
  if (!sha || !sha.trim()) {
    return 'dev';
  }
  const cleanSha = sha.trim();
  const dirty = cleanSha.endsWith('-dirty');
  return `${cleanSha.replace(/-dirty$/, '').slice(0, 7)}${dirty ? '-dirty' : ''}`;
}

export function formatVersionInfo(version: string, sha?: string): string {
  const cleanVersion = version.startsWith('v') ? version : `v${version}`;
  return `${cleanVersion} · ${resolveCommitSha(sha)}`;
}

export function getBuildVersionInfo(): string {
  return formatVersionInfo(__APP_VERSION__, __COMMIT_SHA__);
}
