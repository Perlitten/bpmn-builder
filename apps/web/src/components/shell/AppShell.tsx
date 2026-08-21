import { useEffect, type ReactNode } from 'react';
import type { AppRoute } from '../../routes/types';

type AppShellProps = {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  children: ReactNode;
};

export function AppShell({ route, children }: AppShellProps) {
  const isEditor = route.name === 'editor';

  useEffect(() => {
    document.documentElement.classList.toggle('is-editor', isEditor);
    return () => document.documentElement.classList.remove('is-editor');
  }, [isEditor]);

  return (
    <div
      className={
        isEditor
          ? 'product-shell flex h-dvh flex-col overflow-hidden bg-surface'
          : 'product-shell flex h-dvh flex-col overflow-hidden bg-canvas'
      }
    >
      <main
        className={
          isEditor
            ? 'relative min-h-0 flex-1 overflow-hidden'
            : 'flex min-h-0 flex-1 flex-col overflow-hidden'
        }
      >
        {children}
      </main>
    </div>
  );
}
