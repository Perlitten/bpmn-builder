# UX audit — semantic BPMN 2.0 builder

> [!WARNING]
> Historical code-review snapshot from 2026-08-13. Mini BPMN previews, export, modal focus handling, rail labels/targets, keyboard blocking, font loading, and several other findings below have since changed. Reproduce a finding in the current UI and code before acting on it; current architectural gaps live in [GAPS.md](GAPS.md).

**Date:** 2026-08-13  
**Scope:** `apps/web` only. Do not implement the layout engine. Do not revert sibling work in `packages/*`.  
**Method:** Code review of `apps/web/src/**` against `.cursor/rules/product-ui-bpmn-native.mdc`, `semantic-bpmn-north-star.mdc`, `semantic-component-library.mdc`, `ARCHITECTURE.md`, `GAPS.md`. Curl of `http://localhost:5173/` and `/processes/onboarding` (SPA shell 200). Live `GET /api/processes` used to confirm real drafts + BPMN XML. No OS browser.

---

## Verdict

| Test | Result |
| --- | --- |
| 1. CRM litmus (home) | **PASS with caveats** — describe bar, ASCII BPMN schematic, Import BPMN, and `BPMN / Style / Quality / Layout` scores cannot be relabeled into a CRM. Header chrome (`BPMN` + Search + `+ New`) is still generic. |
| 1. CRM litmus (editor) | **PASS** — category rail, catalog flyout, Continue-with, inspector Change-to / flow kinds are BPMN-native. |
| 2. Forbidden copy | **PASS** — no user-facing board / infinite canvas / flow buddy / mascot. `is-board` / `bpmn-board` / `--color-bipi-*` already renamed in CSS. |
| 3. Home in 10 seconds | **PARTIAL** — describe, templates, import, kind/sort, pagination exist. Preview is ASCII, not a BPMN mini-diagram. Quality scores are real (`@bpmn/rules`). |
| 4. Editor chrome | **PARTIAL** — semantic catalog (not a 50-icon strip). Space Tool UI + `S` blocked. Yellow root outline CSS-hidden. Inspector on select. Header has back / name / autosave / draft / template / clear. Rail still cramped; bpmn-js **L** / **C** / **R** still live. |
| 5. Tone (Linear × Figma × JetBrains) | **PARTIAL** — dense, 1px borders, little shadow. Accent teal `#14b8a6` + coral danger `#fb7185` still a pastel pair. Type scale is 10/11/12/sm soup. Inter declared, never loaded. |
| 6. 8px grid | **PARTIAL** — list padding is on-grid; header `h-11` (44px), inspector `252px`, Continue `+` `22px` are not. |
| 7. Accessibility | **FAIL several WCAG 2.5.8 / dialog patterns** — 22px `+`, 2px-padded toggles, dialogs without focus trap, ConfirmDialog has no Escape. |
| 8. bpmn-js leftover vs product | **Still a bpmn-js Modeler with product chrome** — default palette/context-pad/bendpoints CSS-hidden, not unregistered. Connect, lasso, replace popup, direct edit, attach-at-XY remain. |

**No user-facing P0 copy.** Closest P0 is **global connect as free arrows** (banned in architecture). Everything else is P1/P2 execution work.

---

## What already works (do not redo)

- Home is a **process list**, not “your boards”. Describe copy is honest: linear Start → tasks → End, no XOR (`ProcessListPage.tsx:158-160`).
- Templates, Import BPMN, kind/sort, page size 20, blank Start → Task → End.
- List quality strings come from `lintProcess` / `formatScores` (`ProcessRow.tsx:14-30`) — not an LLM number.
- Left rail is category doors + searchable flyout (`PaletteRail.tsx`, `CatalogFlyout.tsx`). Default `.djs-palette` is `display: none`.
- Space Tool: CSS hide (`.djs-space-tool`) + `editorActions.allowed` returns false for `spaceTool` (`semanticGeometry.ts:17-19`). Keyboard `S` no-ops.
- Root gold ring: outline none on container/svg + hide plane/root `.djs-outline` (`index.css:71-99`). Verify in Glass; selectors look sufficient.
- Inspector mounts only when a selectable element is selected (`BpmnEditor.tsx:395`). Process/Collaboration are not selectable (`selectable.ts:7`).
- Editor header: Back, name, Saving…/Saved · time, Save draft, Save as template, Clear (`EditorChrome.tsx`).
- Contextual `+` → Decision / Wait maps to XOR/OR/event-based (`registry.ts:653-666`).
- Unimplemented catalog rows are searchable and disabled with a reason — **but only when the flyout search query is non-empty**.

---

## P0 — fix first

### P0-1. Sequence / message flow still start bpmn-js global connect (Visio arrows)

**Why it fails:** Architecture bans “global connect as free Visio arrows”. Catalog Flows → Sequence / Message, and keyboard **C**, still call `connect.start` / `globalConnect.start`. Hint text claims sequence “will be routed canonically”; connect is adopted via `saveXML` + `adoptXml`, not a layout compile of that edge.

| File | Lines |
| --- | --- |
| `apps/web/src/components/bpmn-editor/palette/createFromCatalog.ts` | 23–35 |
| `apps/web/src/components/bpmn-editor/palette/createFromCatalog.test.ts` | 50–59 (asserts `globalConnect.start`) |
| `apps/web/src/components/bpmn-editor/BpmnEditor.tsx` | 201–208 (`connect.end` → `adoptXml`) |
| `apps/web/src/components/bpmn-editor/palette/semanticGeometry.ts` | 17–19 (blocks `spaceTool` only, not `globalConnectTool`) |

**Execute:**

1. Block `editorActions.allowed` for `globalConnectTool` the same way as `spaceTool`.
2. Sequence flow: if a source is selected, create `flow.sequence` through the semantic session (or disable the row with “Select a source, then a target in the inspector”). Do not start `globalConnect`.
3. Message flow: keep `canCreate=false` until kernel/layout owns it; flyout already has “Add a pool first”. Do **not** fall back to click-click connect.
4. Rewrite the sequence hint — delete “routed canonically” until layout actually routes that connect.
5. Update `createFromCatalog.test.ts` — the message-flow test that expects `globalConnect.start` must invert.

Do **not** implement the layout engine to “make connect canonical”. Disable the leftover.

---

## P1 — product-visible, do next

### P1-1. Category flyouts hide unimplemented types until the user searches

**Done.** Empty query lists `bpmnComponentRegistry.listByCategory` rows, including unimplemented, disabled with a reason. Search filters; it is not the only reveal.

### P1-2. Two catalogs; flyout search ignores `semanticMeaning`

**Done.** One vocabulary: `BpmnComponentRegistry` (`start.none`). Flyout `search` / `listByCategory` call the kernel registry; haystack includes `semanticMeaning` and `agentHints`. “timeout during activity” finds `boundary.timer`.

### P1-3. Home preview is ASCII, not a BPMN mini-diagram

`BpmnSchematic` renders `●──[Task]──◎` / `◇` glyphs. Honest and BPMN-specific, but Home-in-10-seconds asks for **real BPMN artifacts** (litmus: process list with BPMN previews). Live API processes are starter XML with DI — a 120×36 SVG thumbnail from that XML is feasible without a new layout engine (read-only `bpmn-js` Viewer or a static SVG from existing DI).

| File | Lines |
| --- | --- |
| `apps/web/src/components/process-list/BpmnSchematic.tsx` | 7–19 |
| `apps/web/src/lib/bpmnPreview.ts` | 143–153, 286–338 |
| `apps/web/src/components/process-list/ProcessRow.tsx` | 24 |

**Execute:** Keep the happy-path string as fallback/`title`. Add a real mini-preview column (Viewer, `fit-viewport`, no tools). Do not fake a drawing thumbnail. If DI is missing, keep ASCII and label “No diagram interchange”.

### P1-4. Quality scores vanish below `sm`; inspector scores vanish with deselect

List scores are `hidden … sm:block` (`ProcessRow.tsx:25-32`). Home-in-10-seconds requires quality on the list. Editor shows `formatScores` only in the inspector footer, which unmounts when nothing is selected (`BpmnEditor.tsx:395`).

**Execute:** Always show the score column (wrap or secondary row). Add a process-level strip in the editor (header or empty-inspector panel): same `formatScores(lint)` + top findings, five layers not mashed into one bag if you touch `formatScores` (owned by rules — coordinate, don’t rewrite the scorer in UI).

### P1-5. Rail labels are truncated / wrong; rail still tight

| Caption now | Spec |
| --- | --- |
| Activity | Activities |
| Gateway | Gateways |
| Pools | Participants |
| Artifact | Artifacts |

`--rail-w: 64px`, labels `10px` (`palette.css:1-43`, `PaletteRail.tsx:28-36`). “Pools” is the wrong BPMN word (lanes live here too).

**Execute:** Widen rail to 72px (9×8). Use full spec names. Keep 40px min hit height. Do not go back to a 48px icon-only strip.

### P1-6. bpmn-js keyboard leftovers: L lasso, C connect, R replace, E direct edit, Ctrl+F find

`BpmnModeler` is constructed with default modules (`BpmnEditor.tsx:136-140`). `semanticGeometry` blocks resize / waypoints / rotate / `spaceTool` only.

**Execute:** In `semanticGeometry.ts`, also return false for `lassoTool`, `globalConnectTool`, `replaceElement` (product replace is the inspector). Keep `handTool` and selection. Hide `.djs-popup` / replace menu in CSS as a belt. Direct edit **E** can stay if inspector rename is synced; otherwise it is a second editor.

### P1-7. Inspector Attach is click-to-place XY and does not persist through the semantic session

`attachBoundary` creates a bpmn-js shape at host center/bottom pixels and never `emit`s (`inspectorOps.ts:133-146`, `BpmnEditor.tsx:443-447`). Next semantic compile can wipe it. Copy already said “geometry leftover” once; current hint is softer (`createFromCatalog.ts:41-43`).

**Execute:** Disable Attach until kernel `canCreate(boundary.timer)` exists, **or** `adoptXml` + `emit` after attach and accept mixed session (GAPS: mixed fallback). Do not leave a button that looks semantic and writes XY.

### P1-8. “Save draft” vs autosave vs unused lifecycle

Domain **does** have `draft | published | archived | template` (`packages/domain/src/types/ProcessStatus.ts`). Autosave already PATCHes XML. “Save draft” only stamps `status: 'draft'` (`ProcessEditorPage.tsx:79-85`). List hides `draft` (`ProcessRow.tsx:15`) so the stamp is invisible. No Publish / Archive in the UI.

**Execute:** Either (a) drop the extra Save draft button and treat autosave as the draft, or (b) show status in the header (`Draft` / `Template`) and add Publish only if the API means it. Do not invent a third lifecycle. “Save as template” is real — keep.

### P1-9. No Export / view BPMN XML in the editor

Home can import; editor cannot export. Litmus: prominent chrome should expose a BPMN-specific capability (XML is the obvious one).

**Execute:** Header action `Export BPMN` → download `session.xml()` as `.bpmn`. Optional read-only XML drawer. Do not make XML the editing model.

### P1-10. Accessibility: hit targets, dialogs, titles

| Issue | Where |
| --- | --- |
| Continue `+` is 22×22 | `palette.css:205-221` |
| Kind/sort toggles `px-1 py-0.5` | `ProcessListPage.tsx:317-323` |
| Confirm Clear: no Escape, no focus trap, no `aria-describedby` | `ConfirmDialog.tsx` |
| New process dialog: no focus trap | `NewProcessDialog.tsx` |
| Document title never changes | `index.html` + `App.tsx` |
| Catalog flyout `role="dialog"` without `aria-modal` / trap | `CatalogFlyout.tsx:36` |
| Continue menu `role="menu"` without `menuitem` / arrow keys | `ContinueWith.tsx` |
| Disabled catalog rows use `aria-disabled` but stay `<button>` | `CatalogFlyout.tsx:56-59` |
| `keyboard: { bindTo: document }` steals keys globally | `BpmnEditor.tsx:138` |

**Execute:** `+` ≥ 24×24 (32px preferred). Toggles min 32px height. ConfirmDialog: Escape, initial focus, restore focus. `document.title` = process name or “Processes — BPMN 2.0 Builder”. Bind bpmn-js keyboard to the canvas host, not `document`.

### P1-11. Tone: teal/coral + mixed radius + Inter missing

`index.css:8-10` accent `#14b8a6`, danger `#fb7185`. Zoom inner buttons `rounded-lg` inside a 0-radius cluster (`BpmnZoomControls.tsx:16-40`). Buttons use Tailwind `rounded` (4px); rail uses 2px. `font-family: Inter` with no `@fontface` / font link (`index.css:15`, `index.html`).

**Execute:** One accent (ink or a single blue, not mint-teal). Danger = real red, not rose. Radius token 2px or 4px everywhere; strip `rounded-lg` on zoom. Load Inter or switch to `ui-sans-serif` + `ui-monospace` only. Do not reintroduce 22px cards / 3D shadows (already deleted).

---

## P2 — polish

### P2-1. Header CTA and search placeholders are generic

`+ New` / placeholder `Search` (`ProcessListPage.tsx:126, 133`). sr-only already says “Search processes”. Copy: `New process`, `Search processes`. Cheap and helps the litmus.

### P2-2. Page `h1` is “Recent” / “Name” (the sort), not “Processes”

`ProcessListPage.tsx:178-180`. Screen readers never hear a process-list heading. Use `h1` Processes; keep sort as a control.

### P2-3. Templates block is unbounded and duplicates the list

`TemplatesSection` ignores search/pagination; kind=all still lists templates again. Filter templates by `q` or collapse the section when kind=process.

### P2-4. Starter badge + ASCII may look like decoration on every new process

Most API rows are Start → Task → End. Preview still communicates BPMN; consider de-emphasizing “Starter” once counts exist.

### P2-5. Inspector width 252px; header `h-11` (44px); flyout padding 10px

Snap inspector to 256px, header to 40 or 48, horizontal padding to 8/16.

### P2-6. `PROFILE_IDS` / `inModelingProfile` on the palette catalog is unused for filtering

`registry.ts:45-53, 74`. Source of truth is `bpmnComponentRegistry.implemented`. Delete the dead field or wire it — don’t keep two “implemented” bits.

### P2-7. GAPS.md CSS note is stale

`--color-bipi-*` is gone from `index.css`. Update GAPS when someone is already there; not a UI fix.

### P2-8. Flyout / Continue do not close on outside click

Only Escape (`BpmnEditor.tsx` key handler). Add pointer-down outside.

### P2-9. Import file input is `sr-only` without an accessible name of its own

`ImportBpmnButton.tsx:27-32`. Button click is OK; add `aria-label="Import BPMN 2.0 file"` on the input.

### P2-10. No skip link; main landmark exists via `AppShell` `<main>`

Add skip to list / skip to diagram if keyboard users hit the rail first.

### P2-11. Replace icons still use bpmn-js icon font classes

`palette-item-icon ${entry.item.iconClass}` (`CatalogFlyout.tsx:66`). Acceptable until product glyphs exist; don’t clone PaletteProvider to get more icons.

### P2-12. `formatScores` dumps layers into one string

`packages/rules/src/lintProcess.ts:39-44`. UI should not invent a second scorer. When rules workstream exposes per-layer chips, render BPMN / Style / Quality / Layout as four labeled figures, not one muted line. Execution profile (layer 2) is absent — don’t fake it.

---

## bpmn-js leftover inventory

| Leftover | Status | Action |
| --- | --- | --- |
| Default `PaletteProvider` strip | CSS `display:none` | Keep hidden; do not clone. Prefer `additionalModules` that skip palette if easy. |
| Space Tool | CSS hidden + `allowed=false` | Done for UI. Leave module loaded if lane internals need it. |
| Context pad | CSS hidden (`index.css`, `palette.css`) | Keep hidden. Product `+` replaces append. |
| Bendpoints / segment dragger / resize | CSS hidden + commands blocked | Keep. |
| Lasso **L** | Live | Block in `semanticGeometry` (P1-6). Lasso-as-selection is allowed only if it is a product Select mode, not a secret key. |
| Global connect **C** | Live | P0-1. |
| Replace popup **R** | Live | Block; inspector Change-to is the product. |
| Direct editing **E** / double-click label | Live | Sync or disable. |
| Ctrl+F bpmn-js find overlay | Live | Block or restyle; product search is the catalog. |
| `bjs-powered-by` | Hidden | Keep hidden. |
| diagram-js selection cyan | Default CSS | Optional: retokenize `--element-selected-outline-stroke-color` to ink. |
| Attach boundary XY | Live, unsaved | P1-7. |
| Typed replace via `bpmnReplace` | Fallback in inspector | Honest until kernel replace covers the type; don’t hide types only here. |
| `keyboard.bindTo: document` | Live | P1-10. |

Renderer (`bpmn-js` import/export) stays. That is architecture.

---

## Suggested execution order for other agents

1. **P0-1** — kill global connect as a create path (tests in `createFromCatalog.test.ts`).
2. **P1-1** — show disabled catalog rows in every category.
3. **P1-6** — block L / C / R (and find) in `semanticGeometry.ts`.
4. **P1-5** — rail 72px + full labels.
5. **P1-10** — 24px `+`, dialog Escape, canvas-scoped keyboard.
6. **P1-3** — BPMN mini-preview on the list (Viewer, no tools).
7. **P1-4 / P1-8 / P1-9** — scores always visible; draft chrome honesty; Export BPMN.
8. **P1-2** — one registry (coordinate with kernel; don’t fork a third list).
9. P2 copy/radius/title.

---

## Out of scope (this audit)

- Canonical layout engine, token geometry, MIWG.
- Agent / NL → XOR (`GAPS.md` — describe is linear on purpose).
- Reverting `packages/semantic-core`, `layout-engine`, `rules`.
- Opening the OS browser.
