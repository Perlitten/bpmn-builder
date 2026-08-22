import { GoogleSignInAction } from './GoogleSignInAction';

type LandingSignInPanelProps = {
  configured: boolean | null;
  oauthError: string | null;
  setupError: string | null;
  callbackUrl?: string;
};

export function LandingSignInPanel({
  configured,
  oauthError,
  setupError,
  callbackUrl,
}: LandingSignInPanelProps) {
  return (
    <section id="signin" className="scroll-mt-4 px-4 pb-16 pt-12 sm:px-5">
      <div className="mx-auto max-w-[460px]">
        <div className="landing-panel relative px-6 pb-6 pt-8 sm:px-7">
          <span className="absolute -top-3 left-5 bg-canvas px-2 font-mono text-xs font-medium leading-none tracking-[0.14em] text-ink-soft">
            PLAYER 1
          </span>
          <h2 className="font-display text-2xl font-bold leading-[1.3] text-ink">Sign in to save processes</h2>
          <p className="mt-3 text-pretty font-mono text-xs leading-7 text-ink-soft">
            Signing in is what lets you save and manage your processes. Google OAuth only. Your BPMN diagrams stay private to this account.
          </p>

          {oauthError ? (
            <div className="mt-5 border-3 border-danger-strong p-3.5" role="alert">
              <p className="font-mono text-[11px] font-semibold tracking-[0.12em] text-danger-strong">SIGN-IN FAILED</p>
              <p className="mt-2 font-mono text-xs leading-6 text-ink">{oauthError}</p>
            </div>
          ) : null}

          <GoogleSignInAction configured={configured} label="CONTINUE WITH GOOGLE" className="mt-6" />

          {setupError ? (
            <div className="mt-4 border-2 border-line-strong p-3 font-mono text-[11px] leading-5 text-ink-soft" role="alert">
              <p className="font-semibold text-ink">Google OAuth is not configured</p>
              <p className="mt-1">{setupError}</p>
              {callbackUrl ? <p className="mt-2 break-all">Redirect URI: {callbackUrl}</p> : null}
            </div>
          ) : null}

          <p className="mt-5 font-mono text-[10px] font-medium leading-5 tracking-[0.08em] text-ink-soft">
            NO PASSWORDS · NO PER-SEAT PRICING · NO TRIAL TIMER
          </p>
        </div>
      </div>
    </section>
  );
}
