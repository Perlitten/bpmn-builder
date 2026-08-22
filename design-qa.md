# Process List Redesign — Design QA

## Target and evidence

- Source: `Process List Redesign.dc.html`
- Desktop workbench: source and implementation at 1360 × 760, device scale 1
- Desktop empty state: source and implementation at 1360 × 420, device scale 1
- Mobile list/detail/capture: source 390 × 844 normalized to the 390 × 774 app viewport by removing the 44 px status bar and 26 px home-indicator chrome; implementation at 390 × 774, device scale 1
- Combined comparisons:
  - `design-qa-comparison-desktop.png`
  - `design-qa-comparison-empty.png`
  - `design-qa-comparison-mobile.png`

## Iteration history

### Iteration 1

- Desktop diagram inherited source DI coordinates and rendered the gateway branches too low and too large.
- Mobile detail retained the global list header, used a taller canvas than the target, and omitted the fit/shape badge and mobile metadata.
- Empty desktop reused the workbench header and rendered a disabled primary action.
- Loading skeleton exposed an invalid `aria-label` on a role-less element.

### Fixes

- Normalized preview columns and branch distribution for compact and desktop detail schematics while preserving real process topology.
- Added the dedicated mobile detail header, 264 px preview canvas, fit/shape badge, generated-from label, update metadata, and bottom action dock.
- Added a dedicated empty header, seeded example input, active creation action, and source-aligned template presentation labels.
- Added `role="status"` to the loading skeleton and verified the populated list with Axe on desktop and mobile.

### Iteration 2

- Re-captured desktop workbench, desktop empty state, mobile list, mobile detail, and mobile capture.
- Compared every source/implementation pair in one combined surface at matching viewport dimensions.
- No remaining P0, P1, or P2 visual defects.

## Surface review

- Typography: Inter and IBM Plex Mono hierarchy, caps labels, metrics, timestamps, and action labels match the source language.
- Spacing and geometry: 396 px desktop index, 52 px header, dense 56 px desktop rows, 88 px mobile rows, 264 px mobile preview, and fixed mobile composer/action docks match the target structure.
- Color and borders: ink, canvas, surface, teal accent, findings tones, square corners, and one-pixel separators use shared tokens.
- Assets and icons: existing Architect sprite and Lucide controls are used; no placeholder or hand-drawn assets were introduced.
- Copy and behavior: search, tabs, sort, preview selection, zoom, export, duplicate, rename, delete, template use, describe-to-BPMN, dictation fallback, mobile capture, and editor navigation are wired to real product actions.
- Accessibility: keyboard-operable controls, 44 px shared hit targets, reduced-motion support, forced-colors compatibility, and no serious/critical Axe findings in populated desktop/mobile states.

## Intentional dynamic differences

- Process timestamps, versions, structure counts, and quality findings come from real API/process data rather than being fabricated to match the static mock.
- Built-in template structures reflect the actual executable starter workflows; only the presentation labels required by the redesign are adapted in onboarding surfaces.
- Shared controls keep the product-wide 44 px accessible hit area even where the static source shows a smaller visual box.

---

## Previous report — BPMN palette and Architect mascot

### Sources

- Palette target: `/Users/a.damashkevich/.codex/generated_images/019fff5a-d9db-7873-afff-17d9f3f79ed1/exec-426c4f04-d595-4b35-90c2-5262ed868371.png`
- Mascot target: `/Users/a.damashkevich/.codex/generated_images/019fff5a-d9db-7873-afff-17d9f3f79ed1/exec-626a0d64-1d79-44c6-93bb-0d13f063fe63.png`
- Mascot animation sheet: `/Users/a.damashkevich/.codex/generated_images/019fff5a-d9db-7873-afff-17d9f3f79ed1/exec-1385e5c6-31ce-4d85-ad05-a3c5e9d79791.png`
- Responsive before/after comparison: `/Users/a.damashkevich/.codex/visualizations/2026/08/14/019fff5a-d9db-7873-afff-17d9f3f79ed1/responsive-before-after-comparison.png`
- Final implementation screenshot: `/Users/a.damashkevich/.codex/visualizations/2026/08/14/019fff5a-d9db-7873-afff-17d9f3f79ed1/palette-mascot-final.png`
- Final normalized comparison: `/Users/a.damashkevich/.codex/visualizations/2026/08/14/019fff5a-d9db-7873-afff-17d9f3f79ed1/palette-comparison-final.png`
- Overlap regression screenshot: `/Users/a.damashkevich/.codex/visualizations/2026/08/14/019fff5a-d9db-7873-afff-17d9f3f79ed1/palette-overlap-fixed.png`
- Hover greeting and selected Select screenshot: `/Users/a.damashkevich/.codex/visualizations/2026/08/14/019fff5a-d9db-7873-afff-17d9f3f79ed1/mascot-hover-selected-state.png`
- Selected Pan and idle mascot screenshot: `/Users/a.damashkevich/.codex/visualizations/2026/08/14/019fff5a-d9db-7873-afff-17d9f3f79ed1/pan-selected-mascot-idle.png`

### Normalization

- Reference palette: 803 × 1958 px, approximately 2× density.
- Implementation viewport: 739.5 × 563 CSS px at device pixel ratio 2; captured as 1479 × 1126 px.
- Comparison keeps the same physical density. The implementation is cropped from the editor origin (88 physical px below the app header) to 803 px wide, then placed beside the unscaled reference.
- Compared state: desktop editor, Select active, Add catalog open on its home view, empty search, Categories and Suggested visible.

### Full-view review

- The rail is 64 CSS px wide and preserves the reference hierarchy: Select, Pan, divider, accented Add, divider, Recent shortcuts.
- The catalog is 260 CSS px wide, begins 137 CSS px below the editor rail origin, uses a 1 px border, no shadow, no gradient, and matches the reference panel/search/category density.
- On this shorter viewport the panel scrolls instead of overflowing; the full Suggested section remains keyboard and pointer reachable.
- The selected mascot is rendered from a six-state image-generated sprite sheet. Its head and torso stay fixed while the image states supply real blink, mouth, and arm poses.

### Focused comparison and iterations

1. First pass unified the former seven permanent category buttons behind Add and introduced Recent, Categories, search, and Suggested actions.
2. A normalized side-by-side comparison exposed a 47 CSS px vertical offset in an intermediate panel position. The panel was restored to 137 CSS px, aligning its top with the reference while Add remains lower and connected by the teal pointer.
3. Search typography was changed from the legacy monospace field to the product sans face; the double focus outline was reduced to a single high-contrast border.
4. Exclusive gateway shortcuts were changed from the implementation-specific XOR glyph to the empty diamond shown in the target.
5. The single 12 KB raster was replaced after motion QA showed that whole-image rotation read as a broken neck. A six-frame WebP now separates neutral, blink, talking, and two wave states without rotating the robot. The three source columns were registered to the same body center so state changes do not jerk sideways.
6. A short-viewport regression showed the canvas zoom bar above the scrolled Suggested rows. The open rail now creates a higher stacking context (`14` versus zoom `10`); hit-testing in the geometric overlap resolves to the catalog, and the list has bottom scroll padding.
7. `Hello` was restricted to pointer entry on the mascot itself. Browser checks confirmed: idle opacity `0`; hover switches to `architect-sprite-hello`; the frame advances through closed-mouth, open-mouth, waving, and blink positions; leaving hides the chip and does not repeat until the next entry.
8. Select and Pan now use a dark filled active state with white icon/text. Pointer activation switches both `aria-pressed` and the visible fill; Add keeps its separate teal open state.
9. The body now floats only on the vertical axis (`+1px` to `-4px`). A separately extracted source shadow stays grounded and scales from `1.08` near the floor to `0.72` at the top of the float, with synchronized opacity.
10. The compact bottom-rail breakpoint moved from 720 px to 560 px. At the reported 638 CSS px viewport the modeling rail remains on the left, the inspector stays on the right, and the corrected mascot is fully visible at the intended scale.

### Functional QA

- Add toggles the modal catalog; close, backdrop, and Escape dismiss it.
- Category buttons drill into the existing BPMN registry rather than a static mock.
- Search, ArrowUp/ArrowDown, Enter, focus trapping, disabled reasons, and direct creation callbacks are preserved.
- Recent and Suggested entries resolve against current selection/participant context before creation.
- Compact layout retains 44 px hit targets and opens the catalog as a bottom sheet above the horizontal rail.
- TypeScript check, all 350 tests, and production build pass.

final result: passed
