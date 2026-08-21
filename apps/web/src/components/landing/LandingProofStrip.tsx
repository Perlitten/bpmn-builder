const scoreItems = [
  ['AUTO', 'SHAPES PLACED'],
  ['0', 'PIXELS NUDGED'],
  ['BPMN 2.0', 'CANONICAL XML'],
  ['LIVE', 'LOCAL PREVIEW'],
] as const;

const controls = [
  ['/', 'catalog'],
  ['SPACE', 'pan'],
  ['ENTER', 'place it, name it'],
] as const;

export function LandingProofStrip() {
  return (
    <section className="border-b-4 border-ink bg-ink px-4 py-5 text-canvas sm:px-5">
      <div className="mx-auto flex max-w-[940px] flex-col gap-4 font-mono">
        <div className="flex flex-wrap items-baseline gap-x-7 gap-y-3">
          <span className="text-[10px] font-medium tracking-[0.14em] text-line-strong">SYSTEM STATUS</span>
          {scoreItems.map(([value, label]) => (
            <span key={label} className="text-[13px] font-medium leading-6 text-canvas">
              {value} <span className="text-[10px] tracking-[0.08em] text-line-strong">{label}</span>
            </span>
          ))}
        </div>
        <div className="h-px bg-ink-soft" />
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span className="text-[10px] font-medium tracking-[0.14em] text-line-strong">OUTPUT</span>
          <span className="text-[13px] font-semibold">BPMN 2.0 XML</span>
          <span className="text-[11px] leading-6 text-line-strong">for tools that read the standard</span>
        </div>
        <div className="h-px bg-ink-soft" />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <span className="text-[10px] font-medium tracking-[0.14em] text-line-strong">EDITOR CONTROLS</span>
          {controls.map(([key, label]) => (
            <span key={key} className="flex items-center gap-2">
              <kbd className="grid min-h-8 min-w-8 place-items-center border-2 border-canvas px-2 text-[10px] font-semibold tracking-[0.06em]">
                {key}
              </kbd>
              <span className="text-[11px] text-line-strong">{label}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
