import { useEffect, useState } from 'react';
import { Button } from '../components/ui/Button';
import { ShowcaseDemo } from '../components/showcase/ShowcaseDemo';
import { fetchAuthStatus, type AuthStatus } from '../lib/auth';
import { pageTitle } from '../lib/pageTitle';
import { getBuildVersionInfo } from '../lib/version';

function authErrorMessage(code: string | null): string | null {
  if (code === 'denied') return 'Google sign-in was cancelled.';
  if (code === 'state') return 'Sign-in expired. Try again.';
  if (code === 'config') return 'Google OAuth is not configured on the server.';
  if (code === 'oauth') return 'Google sign-in failed.';
  return null;
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

export function SignInPage() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const errorCode = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('error');
  const oauthError = authErrorMessage(errorCode);

  useEffect(() => {
    document.title = pageTitle('list');
    const ac = new AbortController();
    void fetchAuthStatus(ac.signal).then(setStatus);
    return () => ac.abort();
  }, []);

  const configured = status?.configured === true;
  const setupError = status && !status.configured ? status.error : null;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-11 items-center justify-between border-b border-border px-4 shrink-0">
        <span className="text-sm font-semibold tracking-tight text-ink">BPMN Builder</span>
        <div className="flex items-center gap-4">
          {status === null ? null : configured ? (
            <a
              href="/api/auth/google"
              className="text-sm font-medium text-ink hover:underline outline-none focus-visible:ring-2 focus-visible:ring-accent rounded px-1"
            >
              Sign in
            </a>
          ) : (
            <span className="text-sm text-muted cursor-not-allowed">Sign in</span>
          )}
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-12">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
          <div className="text-center mx-auto max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-5xl leading-tight">
              Turn plain-language processes into clean BPMN 2.0.
            </h1>
            <p className="mt-4 text-base text-muted sm:text-lg max-w-2xl mx-auto">
              Describe steps and decisions in plain text. Get an automatically laid-out canonical diagram. Sign in to edit and export.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => document.getElementById('showcase-description')?.focus()}
                className="inline-flex h-11 items-center justify-center rounded-md bg-ink px-6 font-medium text-canvas hover:bg-ink/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink transition-colors w-full sm:w-auto"
              >
                Try the live demo
              </button>
              {status === null ? null : configured ? (
                <a
                  href="/api/auth/google"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-canvas px-6 font-medium text-ink hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink transition-colors w-full sm:w-auto"
                >
                  <GoogleMark />
                  Continue with Google
                </a>
              ) : (
                <Button variant="outline" size="sm" className="h-11 px-6 w-full sm:w-auto" disabled>
                  Continue with Google
                </Button>
              )}
            </div>
          </div>

          <ShowcaseDemo />

          <section className="mx-auto w-full max-w-md border border-border bg-canvas p-5 rounded-md">
            <h2 className="text-base font-semibold tracking-tight text-ink">Sign in to save processes</h2>
            <p className="mt-2 text-sm leading-5 text-muted">
              Continue with Google. No password. Your diagrams stay private to your account.
            </p>
            {oauthError ? (
              <p className="mt-3 border border-danger/40 bg-surface px-3 py-2 text-sm text-danger" role="alert">
                {oauthError}
              </p>
            ) : null}
            {setupError ? (
              <div className="mt-3 border border-border bg-surface px-3 py-2 text-sm text-ink" role="alert">
                <p className="font-medium">Google sign-in is not configured</p>
                <p className="mt-1 text-muted">{setupError}</p>
                {status?.callbackUrl ? (
                  <p className="mt-2 font-mono text-[11px] break-all text-muted">
                    Redirect URI: {status.callbackUrl}
                  </p>
                ) : null}
              </div>
            ) : null}
            {status === null ? (
              <p className="mt-6 text-sm text-muted">Checking Google OAuth…</p>
            ) : configured ? (
              <a
                href="/api/auth/google"
                className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded border border-border bg-canvas text-sm font-medium text-ink outline-none hover:bg-surface focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <GoogleMark />
                Continue with Google
              </a>
            ) : (
              <Button variant="outline" size="sm" className="mt-6 h-10 w-full" disabled>
                Continue with Google
              </Button>
            )}
          </section>
        </div>
      </main>
      <footer className="py-4 text-center">
        <span className="font-mono text-[11px] text-muted">{getBuildVersionInfo()}</span>
      </footer>
    </div>
  );
}
