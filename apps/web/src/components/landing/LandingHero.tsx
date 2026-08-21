import { ShowcaseDemo } from '../showcase/ShowcaseDemo';

export function LandingHero() {
  return (
    <section className="relative overflow-hidden border-b-4 border-ink px-4 pb-14 pt-11 sm:px-5">
      <div className="landing-dither" aria-hidden />
      <div className="relative mx-auto flex max-w-[720px] flex-col items-center gap-[18px] text-center">
        <span className="border-3 border-ink bg-canvas px-2.5 py-2 font-mono text-[11px] font-medium leading-none tracking-[0.12em] text-ink">
          NO DRAGGING. NO ALIGNING. NO NUDGING.
        </span>
        <h1 className="max-w-[20ch] text-balance font-display text-[clamp(2.25rem,6vw,3.5rem)] font-bold leading-[1.05] text-ink">
          Describe processes in plain words
        </h1>
        <p className="max-w-[60ch] text-pretty font-mono text-[13px] leading-7 text-ink-soft">
          Write the steps as a sentence. The editor creates valid BPMN 2.0, places every shape, and keeps the XML ready for review.
        </p>
      </div>

      <div className="relative mx-auto mt-7 max-w-[760px]">
        <ShowcaseDemo />
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <a href="#signin" className="landing-action landing-action-ink px-7 py-4 font-display text-2xl">
            PRESS START
          </a>
          <p className="max-w-[48ch] font-mono text-xs leading-6 text-ink-soft">
            Opens the sign-in checkpoint. Your live draft stays local until you choose to save it.
          </p>
        </div>
      </div>
    </section>
  );
}
