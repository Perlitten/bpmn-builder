import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { AuthGate } from './components/auth/AuthGate';
import { AppShell } from './components/shell/AppShell';
import type { AppRoute } from './routes/types';
import { readRoute, writeRoute } from './routes/appRouting';

const ProcessListPage = lazy(() =>
  import('./pages/ProcessListPage').then((module) => ({ default: module.ProcessListPage })),
);
const ProcessEditorPage = lazy(() =>
  import('./pages/ProcessEditorPage').then((module) => ({ default: module.ProcessEditorPage })),
);

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => readRoute());

  useEffect(() => {
    const onPopState = () => setRoute(readRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((next: AppRoute) => {
    writeRoute(next);
    setRoute(next);
  }, []);

  const returnToList = useCallback(() => {
    if (window.history.state?.fromList) {
      window.history.back();
      return;
    }
    navigate({ name: 'list' });
  }, [navigate]);

  return (
    <AuthGate>
      <AppShell route={route} onNavigate={navigate}>
        <Suspense fallback={<p className="p-6 text-sm text-muted" role="status">Loading workspace…</p>}>
          {route.name === 'list' ? (
            <ProcessListPage onOpenProcess={(id) => navigate({ name: 'editor', processId: id })} />
          ) : (
            <ProcessEditorPage processId={route.processId} onBack={returnToList} />
          )}
        </Suspense>
      </AppShell>
    </AuthGate>
  );
}
