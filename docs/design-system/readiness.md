# Readiness for Design System Migration

## Inline Style Objects
Various elements rely on inline style objects due to dynamic properties like positions or canvas attributes that do not map to static tailwind classes.
- e.g., `style={{ width, height }}` for canvas sizes.
- Hardcoded position styles for drag and drop nodes.

## Third-Party Components
- **bpmn-js**: Injects a lot of custom UI rendering via SVG and its own DOM overlay. Styles are tightly coupled. Elements such as `.djs-palette`, `.bjs-powered-by`, `.djs-container`, and shapes directly have CSS overrides inside `apps/web/src/index.css`. Theming requires intercepting SVG properties (stroke, fill) via CSS classes like `.djs-element.sim-choice`.

## Extrinsic Environments
- Outside React control, bpmn-js canvas interactions operate independently of React state, requiring global CSS overrides rather than component-scoped styles.

## Playwright Visual Snapshots
- `e2e/visual.spec.ts` explicitly uses Playwright visual snapshot `process-list.png` for regression tests: `await expect(page).toHaveScreenshot('process-list.png', {...})`.
- Modifying UI components will result in test failures for these snapshot comparisons because visual changes (color swaps, border radiuses) will fail pixel comparisons.

## Dark Mode
- Dark mode is currently not explicitly implemented in the codebase via standard Tailwind dark mode configurations or CSS variables toggles.
- The root uses `color-scheme: light;` in `apps/web/src/index.css`, forcing light mode defaults. Theme values are hardcoded in the `@theme` block and have no media queries associated with `prefers-color-scheme`.

## Accessibility
- Existing UI manages focus outlines manually via `outline: none !important` and custom rings. Touch target sizes and semantic labels must be preserved when migrating.
