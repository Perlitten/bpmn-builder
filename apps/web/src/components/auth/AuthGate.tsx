import { createContext, lazy, Suspense, useContext, useEffect, useState, type ReactNode } from 'react';
import { completeOAuthHandoff, fetchSessionUser, signOut as postSignOut, type SessionUser } from '../../lib/auth';
import { Button } from '../ui';

const SignInPage = lazy(() =>
  import('../../pages/SignInPage').then((module) => ({ default: module.SignInPage })),
);

type AuthContextValue = {
  user: SessionUser;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth requires AuthGate');
  return value;
}

export function AuthProvider({
  user,
  signOut,
  children,
}: {
  user: SessionUser;
  signOut?: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <AuthContext.Provider value={{ user, signOut: signOut ?? (async () => undefined) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    void completeOAuthHandoff(ac.signal)
      .then(() => fetchSessionUser(ac.signal))
      .then((next) => {
        setUser(next);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (ac.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : 'Could not reach the session service');
        setLoading(false);
      });
    const onUnauthorized = () => setUser(null);
    window.addEventListener('bpmn:unauthorized', onUnauthorized);
    return () => {
      ac.abort();
      window.removeEventListener('bpmn:unauthorized', onUnauthorized);
    };
  }, [attempt]);

  if (loading) {
    return (
      <div className="flex h-dvh flex-col bg-canvas">
        <header className="flex h-11 items-center border-b border-border px-4">
          <span className="text-sm font-semibold tracking-tight text-ink">BPMN</span>
        </header>
        <p className="px-4 py-6 text-sm text-muted">Checking session…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-dvh flex-col bg-canvas">
        <header className="flex h-11 items-center border-b border-border px-4">
          <span className="text-sm font-semibold tracking-tight text-ink">BPMN</span>
        </header>
        <main className="m-auto max-w-md px-6 text-center" role="alert">
          <h1 className="text-lg font-semibold text-ink">Session service is unavailable</h1>
          <p className="mt-2 text-sm text-muted">{error}. Your sign-in state was not changed.</p>
          <Button className="mt-5" variant="accent" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </Button>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<p className="p-6 text-sm text-muted" role="status">Loading sign-in…</p>}>
        <SignInPage />
      </Suspense>
    );
  }

  return (
    <AuthProvider
      user={user}
      signOut={async () => {
        try {
          await postSignOut();
          setUser(null);
        } catch (reason: unknown) {
          setError(reason instanceof Error ? reason.message : 'Could not reach the session service');
        }
      }}
    >
      {children}
    </AuthProvider>
  );
}
