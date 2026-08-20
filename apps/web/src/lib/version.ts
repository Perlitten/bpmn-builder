declare const __APP_VERSION__: string;
declare const __COMMIT_SHA__: string | undefined;

export function resolveCommitSha(sha?: string): string {
  if (!sha || !sha.trim()) {
    return 'dev';
  }
  return sha.trim().slice(0, 7);
}

export function formatVersionInfo(version: string, sha?: string): string {
  const cleanVersion = version.startsWith('v') ? version : `v${version}`;
  return `${cleanVersion} · ${resolveCommitSha(sha)}`;
}

export function getBuildVersionInfo(): string {
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0';
  const rawSha = typeof __COMMIT_SHA__ !== 'undefined' ? __COMMIT_SHA__ : undefined;
  return formatVersionInfo(version, rawSha);
}
