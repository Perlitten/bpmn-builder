type LandingFooterProps = {
  buildVersion: string;
};

export function LandingFooter({ buildVersion }: LandingFooterProps) {
  return (
    <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t-4 border-ink px-4 py-3 font-mono text-[11px] font-medium leading-6 tracking-[0.08em] text-ink-soft sm:px-5">
      <span className="text-ink">BPMN 2.0</span>
      <span>PERLITTEN/BPMN-BUILDER</span>
      <span className="ml-auto">{buildVersion.toUpperCase()}</span>
    </footer>
  );
}
