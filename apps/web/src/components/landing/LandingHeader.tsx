type LandingHeaderProps = {
  buildVersion: string;
};

export function LandingHeader({ buildVersion }: LandingHeaderProps) {
  return (
    <header className="flex min-h-14 flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b-4 border-ink px-4 py-2 sm:px-5">
      <span className="font-mono text-[17px] font-semibold leading-none tracking-[0.18em] text-ink">BPMN</span>
      <span className="font-mono text-xs font-medium leading-none tracking-[0.1em] text-ink-soft">
        2.0 SEMANTIC EDITOR
      </span>
      <span className="ml-auto font-mono text-xs font-medium leading-none tracking-[0.1em] text-ink-soft">
        BUILD {buildVersion.toUpperCase()}
      </span>
    </header>
  );
}
