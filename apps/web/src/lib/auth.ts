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

export async function fetchAuthStatus(signal?: AbortSignal): Promise<AuthStatus> {
  const response = await fetch('/api/auth/status', { credentials: 'same-origin', signal });
  if (!response.ok) {
    return {
      configured: false,
      error: 'Could not read auth status. Is the API server running?',
    };
  }
  return response.json() as Promise<AuthStatus>;
}

export async function fetchSessionUser(signal?: AbortSignal): Promise<SessionUser | null> {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin', signal });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error('Failed to read session');
  }
  const body = (await response.json()) as { user: SessionUser };
  return body.user;
}

export async function signOut(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
}
