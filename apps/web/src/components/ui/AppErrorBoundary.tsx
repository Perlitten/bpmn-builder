import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';

type AppErrorBoundaryProps = { children: ReactNode };
type AppErrorBoundaryState = { failed: boolean };

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ui] Unhandled render error', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas p-6 text-ink">
        <section className="w-full max-w-lg border-2 border-ink bg-canvas p-8" role="alert" aria-labelledby="app-error-title">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Workspace error</span>
          <h1 id="app-error-title" className="mt-3 text-2xl font-semibold">The workspace could not render</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Reload the app to restore the last saved workspace state.
          </p>
          <Button className="mt-6" variant="primary" onClick={() => window.location.reload()}>
            Reload workspace
          </Button>
        </section>
      </main>
    );
  }
}
