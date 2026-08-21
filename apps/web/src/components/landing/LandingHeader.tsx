type LandingHeaderProps = {
  configured: boolean | null;
  buildVersion: string;
};

export function LandingHeader({ configured, buildVersion }: LandingHeaderProps) {
  return (
    <header className="flex min-h-14 flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b-4 border-ink px-4 py-2 sm:px-5">
      <span className="font-mono text-[17px] font-semibold leading-none tracking-[0.18em] text-ink">BPMN</span>
      <span className="font-mono text-xs font-medium leading-none tracking-[0.1em] text-ink-soft">
        2.0 SEMANTIC EDITOR
      </span>
      <span className="ml-auto hidden font-mono text-xs font-medium leading-none tracking-[0.1em] text-ink-soft sm:inline">
        {buildVersion.toUpperCase()}
      </span>
      {configured === true ? (
        <a href="/api/auth/google" className="landing-text-link">
          SIGN IN
        </a>
      ) : (
        <span className="font-mono text-xs font-medium tracking-[0.1em] text-muted">SIGN IN</span>
      )}
    </header>
  );
}
