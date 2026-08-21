# Design System Readiness & Friction Points

## Inline Styles
- Used primarily in `AppShell` (`apps/web/src/components/shell/AppShell.tsx:32`) for dynamic layout values (`--editor-compact-rail`).
- Used in `AppShell` (`apps/web/src/components/shell/AppShell.tsx:33`) for z-index (`zIndex: 100`).
- Used heavily in SVG/canvas manipulation or component coordinate mapping (`apps/web/src/components/bpmn-editor/semantic/dropSlot.ts:85`) where state maps directly to geometric coordinates rather than static design properties.
- This creates friction where visual properties might be dynamically injected rather than referencing static class definitions.

## External Libraries and Global CSS
- **bpmn-js**: Deeply embedded global CSS overrides exist in `apps/web/src/index.css` for `.bjs-container` (line 44), `.djs-container` (line 45), `.djs-palette` (line 70), `.djs-element` (line 144).
  - Injects un-themeable defaults.
  - Specifically, SVG fills and strokes are manually overridden (`fill: none` at line 165, `stroke: var(--color-accent)` at line 145).
  - The design system will need a dedicated theme mapping strategy for bpmn-js SVGs to sync with the token layer.

## Accessibility & Interactive Constraints
- Focus states and hover rings are somewhat consistently implemented via `focus:ring`, but values are hardcoded in components like `apps/web/src/components/ui/Button.tsx:28` (`focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`).
- A centralized component layer needs to wrap interactive primitives (Buttons, Inputs) to enforce these globally without manual repetition.

## Dark Mode
- Currently, the application forces `color-scheme: light;` in `apps/web/src/index.css:16`.
- The token definitions (`--color-ink`, `--color-canvas`, etc.) are static hex codes without media query definitions for `@media (prefers-color-scheme: dark)`.
- Introduction of dark mode will require migrating every single `bg-slate-X` and `text-slate-X` bypass in source files to semantic tokens that can flip conditionally.

## Visual Regression Tests
- Any alteration to the structural tokens (padding, margin, width, height, border radius) will instantly invalidate Playwright visual regression snapshots located in `e2e/visual.spec.ts`.
- The `maxDiffPixelRatio: 0.005` constraint in `playwright.config.ts` (if configured) or the general visual testing setup means even 1px layout shifts from harmonizing padding across near-duplicate components will fail the CI.
