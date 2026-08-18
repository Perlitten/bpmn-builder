import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchSessionUser, signOut as postSignOut, type SessionUser } from '../../lib/auth';
import { SignInPage } from '../../pages/SignInPage';

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

  useEffect(() => {
    const ac = new AbortController();
    void fetchSessionUser(ac.signal)
      .then((next) => {
        setUser(next);
        setLoading(false);
      })
      .catch(() => {
        setUser(null);
        setLoading(false);
      });
    const onUnauthorized = () => setUser(null);
    window.addEventListener('bpmn:unauthorized', onUnauthorized);
    return () => {
      ac.abort();
      window.removeEventListener('bpmn:unauthorized', onUnauthorized);
    };
  }, []);

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

  if (!user) return <SignInPage />;

  return (
    <AuthProvider
      user={user}
      signOut={async () => {
        await postSignOut();
        setUser(null);
      }}
    >
      {children}
    </AuthProvider>
  );
}
