import { useEffect, useState } from 'react';
import { LandingFooter } from '../components/landing/LandingFooter';
import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingHero } from '../components/landing/LandingHero';
import { LandingProofStrip } from '../components/landing/LandingProofStrip';
import { LandingSignInPanel } from '../components/landing/LandingSignInPanel';
import { fetchAuthStatus, type AuthStatus } from '../lib/auth';
import { pageTitle } from '../lib/pageTitle';
import { getBuildVersionInfo } from '../lib/version';
import '../styles/landingFonts';

function authErrorMessage(code: string | null): string | null {
  if (code === 'denied') return 'Google sign-in was cancelled. Nothing was saved.';
  if (code === 'state') return 'The sign-in request expired. Start again from this page.';
  if (code === 'config') return 'Google OAuth is not configured on the server.';
  if (code === 'oauth') return 'Google sign-in did not finish. Try again.';
  return null;
}

export function SignInPage({ initialStatus = null }: { initialStatus?: AuthStatus | null }) {
  const [status, setStatus] = useState<AuthStatus | null>(initialStatus);
  const errorCode = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('error');
  const oauthError = authErrorMessage(errorCode);

  useEffect(() => {
    document.title = pageTitle('list');
    if (initialStatus) {
      setStatus(initialStatus);
      return;
    }
    const ac = new AbortController();
    void fetchAuthStatus(ac.signal)
      .then(setStatus)
      .catch((error: unknown) => {
        if (ac.signal.aborted) return;
        setStatus({
          configured: false,
          error: error instanceof Error ? error.message : 'Could not reach the authentication service.',
        });
      });
    return () => ac.abort();
  }, [initialStatus]);

  const configured = status === null ? null : status.configured;
  const setupError = status && !status.configured ? status.error ?? 'Google OAuth is unavailable.' : null;
  const buildVersion = getBuildVersionInfo();

  return (
    <div className="landing-shell flex min-h-dvh flex-col bg-canvas" aria-busy={status === null}>
      <LandingHeader configured={configured} buildVersion={buildVersion} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <LandingHero />
        <LandingProofStrip />
        <LandingSignInPanel
          configured={configured}
          oauthError={oauthError}
          setupError={setupError}
          callbackUrl={status?.callbackUrl}
        />
      </main>
      <LandingFooter buildVersion={buildVersion} />
    </div>
  );
}
