# Design System Readiness & Friction Points

## Inline Styles
- This creates friction where visual properties might be dynamically injected rather than referencing static class definitions.

## External Libraries and Global CSS
- **bpmn-js**: Deeply embedded global CSS overrides exist in `apps/web/src/index.css` for `.bjs-container`, `.djs-container`, `.djs-palette`, `.djs-element`.
  - Injects un-themeable defaults.
  - Specifically, SVG fills and strokes are manually overridden (`fill: none`, `stroke: var(--color-accent)`).
  - The design system will need a dedicated theme mapping strategy for bpmn-js SVGs to sync with the token layer.

## Accessibility & Interactive Constraints
- Focus states and hover rings are somewhat consistently implemented via `focus:ring`, but values are hardcoded in components like `Button` (`apps/web/src/components/process-list/DuplicateProcessDialog.tsx:78`).
- A centralized component layer needs to wrap interactive primitives (Buttons, Inputs) to enforce these globally without manual repetition.

## Dark Mode
- Currently, the application forces `color-scheme: light;` in `apps/web/src/index.css`.
- The token definitions (`--color-ink`, `--color-canvas`, etc.) are static hex codes without media query definitions for `@media (prefers-color-scheme: dark)`.
- Introduction of dark mode will require migrating every single `bg-slate-X` and `text-slate-X` bypass in source files to semantic tokens that can flip conditionally.

## Visual Regression Tests
- Any alteration to the structural tokens (padding, margin, width, height, border radius) will instantly invalidate Playwright visual regression snapshots located in `e2e/visual.spec.ts`.
- The `maxDiffPixelRatio: 0.005` constraint means even 1px layout shifts from harmonizing padding across near-duplicate components will fail the CI.
