import { useCallback, useEffect, useState } from 'react';
import { AppShell } from './components/shell/AppShell';
import { ProcessEditorPage } from './pages/ProcessEditorPage';
import { ProcessListPage } from './pages/ProcessListPage';
import type { AppRoute } from './routes/types';
import { readRoute, writeRoute } from './routes/appRouting';

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
    <AppShell route={route} onNavigate={navigate}>
      {route.name === 'list' ? (
        <ProcessListPage onOpenProcess={(id) => navigate({ name: 'editor', processId: id })} />
      ) : (
        <ProcessEditorPage
          processId={route.processId}
          onBack={returnToList}
        />
      )}
    </AppShell>
  );
}
