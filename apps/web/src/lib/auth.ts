export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export type AuthStatus = {
  configured: boolean;
  error?: string;
  callbackUrl?: string;
};

export type AuthBootstrap = AuthStatus & {
  user: SessionUser | null;
};

function clearOAuthHandoffFragment(): void {
  window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
}

export async function fetchAuthBootstrap(signal?: AbortSignal): Promise<AuthBootstrap> {
  const response = await fetch('/api/auth/status', { credentials: 'same-origin', signal });
  if (!response.ok) throw new Error('Failed to read authentication status');
  return response.json() as Promise<AuthBootstrap>;
}

export async function fetchAuthStatus(signal?: AbortSignal): Promise<AuthStatus> {
  try {
    const { user: _user, ...status } = await fetchAuthBootstrap(signal);
    return status;
  } catch (error: unknown) {
    if (signal?.aborted) throw error;
    return {
      configured: false,
      error: 'Could not read auth status. Is the API server running?',
    };
  }
}

export async function completeOAuthHandoff(signal?: AbortSignal): Promise<void> {
  const hash = window.location.hash;
  if (!hash.startsWith('#')) return;

  const params = new URLSearchParams(hash.slice(1));
  const token = params.get('auth_token');
  if (!token) return;

  const response = await fetch('/api/auth/complete', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-BPMN-CSRF': '1' },
    body: JSON.stringify({ token }),
    signal,
  });
  if (!response.ok) {
    const terminalTokenFailure =
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 408 &&
      response.status !== 429;
    if (terminalTokenFailure) {
      clearOAuthHandoffFragment();
      return;
    }
    throw new Error('Failed to complete OAuth handoff');
  }
  clearOAuthHandoffFragment();
}

export async function signOut(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-BPMN-CSRF': '1' },
  });
  if (!response.ok) throw new Error('Failed to sign out');
}

export async function updateProfileName(name: string): Promise<SessionUser> {
  const response = await fetch('/api/auth/me', {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-BPMN-CSRF': '1' },
    body: JSON.stringify({ name }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Failed to update profile');
  return (body as { user: SessionUser }).user;
}
