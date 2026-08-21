import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Architect chrome markup', () => {
  it('drags the mascot character without nested buttons', () => {
    const src = readFileSync(new URL('./ArchitectShell.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('./architect.css', import.meta.url), 'utf8');
    expect(src).not.toMatch(/architect-grip/);
    expect(src).toMatch(/onPointerDown\('mascot'\)/);
    expect(src).toMatch(/isArchitectDragMove/);
    expect(src).toMatch(/className="architect-mascot-btn"/);
    expect(src).toMatch(/className="architect-panel-head"/);
    expect(src).not.toMatch(/<button[^>]*architect-mascot-btn/);
    expect(src).not.toMatch(/<button[^>]*architect-panel-head/);
    expect(src).toMatch(/role="button"/);
    const headStart = src.indexOf('architect-panel-head');
    const head = src.slice(headStart, src.indexOf('</div>', headStart) + 6);
    expect(head).not.toMatch(/<button\b/);
    const hitStart = src.indexOf('className="architect-mascot-btn"');
    const inner = src.slice(src.indexOf('>', hitStart), src.indexOf('</div>', hitStart));
    expect(inner).toMatch(/ArchitectMascot/);
    expect(inner).not.toMatch(/<button\b/);
    expect(css).toMatch(/\.architect-mascot-btn[\s\S]*touch-action:\s*none/);
    expect(css).toMatch(/\.architect-mascot[\s\S]*pointer-events:\s*none/);
    expect(css).toMatch(/cursor:\s*grab/);
    expect(css).not.toMatch(/architect-grip/);
  });

  it('keeps Retry / Cancel / timeout recovery in the Architect panel', () => {
    const src = readFileSync(new URL('./ArchitectPanel.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/\bRetry\b/);
    expect(src).toMatch(/\bCancel\b/);
    expect(src).toMatch(/\bEdit\b/);
    expect(src).toMatch(/Applying…/);
    expect(src).not.toMatch(/process vibes/i);
    expect(src).not.toMatch(/flow buddy/i);
  });

  it('uses the selected living mascot artwork instead of a letter glyph', () => {
    const src = readFileSync(new URL('./ArchitectMascot.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/architect-mascot-sprite\.webp/);
    expect(src).toMatch(/architect-mascot-frame/);
    expect(src).not.toMatch(/>A</);
    expect(src).not.toMatch(/Bipi|flow buddy|process vibes/i);
  });

  it('says Hello and waves without nested buttons', () => {
    const mascot = readFileSync(new URL('./ArchitectMascot.tsx', import.meta.url), 'utf8');
    const shell = readFileSync(new URL('./ArchitectShell.tsx', import.meta.url), 'utf8');
    const hello = readFileSync(new URL('./mascotHello.ts', import.meta.url), 'utf8');
    const css = readFileSync(new URL('./architect.css', import.meta.url), 'utf8');
    expect(mascot).toMatch(/className="architect-hello"/);
    expect(mascot).toMatch(/>\s*Hello\s*</);
    expect(mascot).toMatch(/aria-hidden/);
    expect(mascot).toMatch(/is-hello/);
    expect(mascot).toMatch(/useMascotHello/);
    expect(mascot).not.toMatch(/<button\b/);
    expect(hello).not.toMatch(/setInterval|IDLE_WAVE_MS/);
    expect(hello).toMatch(/mood === 'hover'/);
    expect(shell).toMatch(/collapsed=\{!open\}/);
    expect(shell).toMatch(/aria-label=\{open \? 'Close Architect' : 'Open Architect'\}/);
    expect(css).toMatch(/\.architect-hello[\s\S]*pointer-events:\s*none/);
    expect(css).toMatch(/\.architect-mascot\.is-hello[\s\S]*architect-sprite-hello/);
    expect(css).toMatch(/@keyframes architect-sprite-hello \{[\s\S]*?background-position:\s*50% 100%/);
    expect(css).toMatch(/architect-hello-greet/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.architect-hello/);
  });

  it('blinks, talks, and waves without rotating the whole robot', () => {
    const mascot = readFileSync(new URL('./ArchitectMascot.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('./architect.css', import.meta.url), 'utf8');
    const bob = css.slice(
      css.indexOf('@keyframes architect-bob'),
      css.indexOf('@keyframes architect-shadow'),
    );
    expect(mascot).toMatch(/architect-mascot-shadow\.webp/);
    expect(mascot).toMatch(/className="architect-mascot-float"/);
    expect(mascot).toMatch(/className="architect-mascot-shadow"/);
    expect(css).toMatch(/\.architect-mascot-frame \{[\s\S]*?architect-sprite-idle/);
    expect(css).toMatch(/@keyframes architect-sprite-idle \{[\s\S]*?background-position:\s*50% 0/);
    expect(css).toMatch(/@keyframes architect-sprite-hello \{[\s\S]*?background-position:\s*100% 100%/);
    expect(css).toMatch(/@keyframes architect-bob \{[\s\S]*?translateY\(-4px\)/);
    expect(bob).not.toMatch(/translateX/);
    expect(css).toMatch(/@keyframes architect-shadow \{[\s\S]*?scaleX\(0\.72\)/);
    expect(css).not.toMatch(/\.architect-mascot\.is-hello \.architect-mascot-frame \{[^}]*rotate\(/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.architect-mascot-frame/);
  });

  it('submits Architect compose on Enter, not only ⌘/Ctrl+Enter', () => {
    const panel = readFileSync(new URL('./ArchitectPanel.tsx', import.meta.url), 'utf8');
    const list = readFileSync(new URL('./ListArchitect.tsx', import.meta.url), 'utf8');
    expect(panel).toMatch(/isArchitectComposeSubmitKey/);
    expect(list).toMatch(/isArchitectComposeSubmitKey/);
    expect(panel).not.toMatch(/event\.key === 'Enter' && \(event\.metaKey \|\| event\.ctrlKey\)/);
    expect(list).not.toMatch(/event\.key === 'Enter' && \(event\.metaKey \|\| event\.ctrlKey\)/);
  });

  it('sends greetings through the same Architect request path', () => {
    const src = readFileSync(new URL('./ArchitectPanel.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/isGreetingMessage/);
    expect(src).not.toMatch(/greetingReply/);
    expect(src).toMatch(/mergeTimeoutSignal/);
    expect(src).toMatch(/ASSISTANT_TIMEOUT_MS/);
  });

  it('lets list Architect create be cancelled', () => {
    const src = readFileSync(new URL('./ListArchitect.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/AbortController/);
    expect(src).toMatch(/AbortSignal/);
    expect(src).toMatch(/\bCancel\b/);
    expect(src).toMatch(/aria-modal="true"/);
    expect(src).not.toMatch(/board|process vibes|flow buddy/i);
  });

  it('keeps Architect panel chrome readable on white', () => {
    const css = readFileSync(new URL('./architect.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.architect-panel \{[\s\S]*--architect-edge:/);
    expect(css).toMatch(/\.architect-panel textarea::placeholder[\s\S]*opacity:\s*1/);
    expect(css).toMatch(/\.architect-apply \{[\s\S]*background:\s*var\(--color-ink\)/);
    expect(css).toMatch(/\.architect-apply:disabled \{[\s\S]*opacity:\s*1/);
    expect(css).toMatch(/\.architect-scope-options label \{[\s\S]*color:\s*var\(--color-ink\)/);
    expect(css).toMatch(/\.architect-scope-options label\.is-disabled \{[\s\S]*opacity:\s*1/);
    expect(css).not.toMatch(/label\.is-disabled \{[\s\S]*opacity:\s*0\./);
    const list = readFileSync(new URL('./ListArchitect.tsx', import.meta.url), 'utf8');
    expect(list).toMatch(/className="architect-meta"/);
    expect(list).not.toMatch(/text-muted/);
  });

  it('portals the list Architect input below the header bar', () => {
    const src = readFileSync(new URL('./ListArchitect.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('./architect.css', import.meta.url), 'utf8');
    expect(src).toMatch(/createPortal/);
    expect(src).toMatch(/listArchitectPanelBox/);
    expect(css).toMatch(/\.architect-panel\.architect-list-panel[\s\S]*position:\s*fixed/);
    expect(css).toMatch(/z-index:\s*var\(--z-architect-list\)/);
  });
});
