# Architecture audit — Semantic BPMN north star

Read-only audit of `/Users/a.damashkevich/Documents/BPMN 2.0` against `ARCHITECTURE.md`, `GAPS.md`, and `.cursor/rules/*.mdc`. No `UX_AUDIT.md` in the repo.

**Verdict:** the target package map exists and the **happy-path compiler** works for a **narrow kernel** (Start → typed Task → XOR/AND/OR → End). The running product is still a **hybrid**: semantic graph + layout-engine for that slice, **bpmn-js Modeler** for connect / replace / attach / message flow, **BPMN XML as persistence**, and a **second palette catalog**. The assistant **emits XML**. Coordinates are derived on semantic commits, then stored as DI in XML.

Statuses: **DONE** / **PARTIAL** / **MISSING**. Evidence is package/file, not intent.

---

## Pipeline score

Target: `Intent → Semantic Process Graph → validation → Structured Layout → BPMN DI → render`

| Stage | Status | Score | Evidence |
| --- | --- | --- | --- |
| Intent | **PARTIAL** | 4/10 | Semantic ops in `packages/semantic-core/src/ops.ts`; catalog/contextual `+` in `apps/web`; describe-to-create is linear only (`apps/web/src/lib/linearProcess.ts`); agent emits XML (`packages/api-server/src/ai/runAssistant.ts`); persistence intent is `bpmnXml` (`packages/domain/src/types/Process.ts`). |
| Semantic Graph | **PARTIAL** | 6/10 | Coordinate-free IR in `packages/semantic-core/src/types.ts`. Missing IR types from the spec: `Participant`, `Lane`, `MessageFlow`, `FeedbackEdge`. Subprocess imported as `task` (`packages/bpmn-adapter/src/semantic-xml.ts`). |
| Validation | **PARTIAL** | 4/10 | `@bpmn/rules` exists. Layers 1/3/4/5 have a few checks. **Layer 2 (execution profile) is absent.** Does not use registry `canCreate` / `engineSupport`. |
| Structured Layout | **PARTIAL** | 7/10 | `@bpmn/layout-engine` is deterministic for linear + XOR/AND/OR regions. Does **not** read `layoutBehavior`. No pools, lanes, boundaries, message flows, feedback corridors, expanded subprocess. |
| BPMN DI | **PARTIAL** | 5/10 | `processToXml` writes layout DI; `xmlToProcess` ignores incoming XY. Custom XML parser, not `bpmn-moddle`. Drops `extensionElements` and boundary events. No MIWG tests. |
| Render | **PARTIAL** | 5/10 | bpmn-js is the renderer (`apps/web/src/components/bpmn-editor/BpmnEditor.tsx`). Default palette/space/resize hidden. Full **Modeler** still mutates the diagram (connect, replace, attach). |

**Overall pipeline: PARTIAL (~5/10).** Same graph + tokens ⇒ byte-identical XML is proven for the kernel slice (`packages/bpmn-adapter/src/adapter.test.ts`, `packages/layout-engine/src/layout.test.ts`). That compiler is not yet the only edit path.

---

## 1. Intent

**PARTIAL**

What exists:

- Semantic mutations: `createProcess`, `addTask` / `addAfter` / `addBefore`, `removeElement`, `renameElement`, `splitExclusive` / `splitParallel` / `splitInclusive`, `addBranch`, `moveAfter`, `moveToBranch`, `replaceBpmnType`, `setFlowKind` — `packages/semantic-core/src/ops.ts`.
- Registry-resolved create: `createFromComponent` — `packages/semantic-core/src/create.ts`.
- Editor session applies ops then compiles XML: `apps/web/src/components/bpmn-editor/semantic/session.ts`.
- Drag is `dropSlot` → `moveAfter` / branch slot, not persisted `x=637`: `apps/web/src/components/bpmn-editor/semantic/dropSlot.ts`.
- Describe-to-create uses `addTask` + `exportProcessXml`: `apps/web/src/lib/linearProcess.ts`. Does not parse XOR (matches `GAPS.md`).

Gaps:

- User intent is still saved as **BPMN XML** (`processes.bpmn_xml` in `packages/db/src/schema/sqlite.ts`). Graph IR is reconstructed on load via `xmlToProcess`.
- Sequence / message connect is bpmn-js `connect` / `globalConnect`, then `session.adoptXml` (`BpmnEditor.tsx`, `createFromCatalog.ts`). Hint claims canonical routing; the **intent** is still a free connect gesture.
- Inspector attach places a boundary at host XY via `modeling.createShape` (`inspectorOps.ts` `attachBoundary`) and does **not** go through the semantic session.
- Replace / delete fall back to bpmn-js when the kernel throws (`BpmnEditor.tsx`).
- `POST /api/assistant` asks the model for `bpmnXml` and `replaceXml` (`runAssistant.ts`). Editor does not apply actions (`GAPS.md`; no `/api/assistant` usage under `apps/web/src`).

---

## 2. Semantic Process Graph (IR)

**PARTIAL**

Done:

- `Process` has `nodes`, `flows`, `scopes`, `regions`, `unstructured`, `idSeq`. Comment: “No DI / coordinates” — `packages/semantic-core/src/types.ts`.
- `StructuredRegion` / `Branch` with stable ids; `rebuildStructure` preserves branch ids by `entryFlowId` — `packages/semantic-core/src/detect.ts`.
- Unmatched splits marked `UNSTRUCTURED` rather than faked — `detect.ts`, `kernel.test.ts`.
- Domain DTO vs graph IR split is documented: `@bpmn/domain` `Process` holds `bpmnXml`; `@bpmn/semantic-core` `Process` is the graph (`packages/domain/src/types/Process.ts`).

Missing vs `ARCHITECTURE.md` IR table:

| Spec type | In kernel? |
| --- | --- |
| `FlowNode` (start/end/task/XOR/AND/OR) | Yes. Event-based **not** a `FlowNodeType`; import maps `EventBasedGateway` → `exclusiveGateway` (`semantic-xml.ts`, `ops.ts` `BPMN_TO_KIND`). |
| `SequenceFlow` + condition/default | Yes. |
| `StructuredRegion` / `Branch` | Yes, for XOR/AND/OR pairing. |
| `Scope` | Root scope only. Nested subprocess scopes not modeled. |
| `Participant` / `Lane` | **MISSING** on IR. Catalog only. |
| `MessageFlow` | **MISSING** on IR. Catalog + bpmn-js connect. |
| `FeedbackEdge` | **MISSING**. No loop corridor. |
| `Activity` / `Event` / `Gateway` / `Subprocess` as distinct IR | Flattened: subprocess/call/intermediate events become `type: 'task'` on import (`NODE_FROM_TAG` in `semantic-xml.ts`). |

Structure detection is a **same-type split/join walk**, not “reachability + dominators/post-dominators + gateway type + scope” as specified (`detect.ts`). Good enough for kernel splits; not a general BPMN region finder.

Unknown BPMN is **not** a safe round-trip: skipped tags include `boundaryevent`, `extensionelements`, `laneset`, data, artifacts (`SKIP_TAGS` in `semantic-xml.ts`). Other unknown tags coerce to `bpmn:Task`.

---

## 3. Validation (five rule layers)

**PARTIAL** — layers exist as a type (`RuleLayer = 1 \| 2 \| 3 \| 4 \| 5` in `packages/rules/src/types.ts`) but are **not** five engines.

| Layer | Spec | Status | Evidence |
| --- | --- | --- | --- |
| 1 BPMN 2.0.2 | Connectivity, scopes, XML/DI validity | **PARTIAL** | Start/end required, flow source/target, dangling nodes — `lintProcess.ts` `layerBpmn`. Regex/tag scrape, not OMG / `bpmn-moddle`. No scope, lane, message-flow, or DI-schema checks. |
| 2 Execution profile | Camunda 8 / Zeebe / neutral | **MISSING** | No `layer: 2` findings. Catalog has `engineSupport` (`packages/semantic-core/src/components/types.ts`); rules never read it. |
| 3 Modeling style | Explicit gateways, happy path, naming | **PARTIAL** | Unnamed XOR, task-must-start-with-verb — `layerStyle`. No happy-path / explicit-join / mixed-abstraction checks. |
| 4 Geometry | Tokens, bands, corridors, no-cross, labels | **PARTIAL** | Binary: DI matches `layoutProcess` exactly → score 100, else `geometry.free-di` suggestion — `layerGeometry`. Not grid/gap/corridor/label rules. |
| 5 Quality | Nesting, branch explosion, mixed level | **PARTIAL** | Gateway count vs `GATEWAY_WARN_AT` (8) only — `layerQuality`. |

Findings use ERROR / WARNING / STYLE / SUGGESTION. Scores are deterministic (count-based), not LLM — matches spec.

Rules **do** depend on layout-engine for layer 4 (`packages/rules/package.json`). They **do not** use `BpmnComponentRegistry.canCreate` / parents / `engineSupport` as `ARCHITECTURE.md` requires.

XML lint path re-parses BPMN with a second regex parser (`packages/rules/src/model.ts`), parallel to `@bpmn/bpmn-adapter` — a third XML brain.

---

## 4. Structured Layout

**PARTIAL**

Done:

- Tokens match the spec (`baseGrid` 8, task 120×72, gateway 48×48, event 40×40, `forwardFlowGap` 96, `branchGap` 64, `edgeClearance` 24) — `packages/layout-engine/src/tokens.ts`.
- Happy-path LTR baseline; spacing between **boundaries**; orthogonal 90° routes — `layout.ts`, `route.ts`.
- Band order follows `branches[]`, not flow array order; adding a task on Yes does not swap Yes/No — `layout.test.ts`.
- Snapshots: same input ⇒ identical `LayoutResult`.
- `fromSemanticProcess` maps core `Process` → `LayoutInput` — `semanticAdapter.ts`.

Gaps:

- Layout does **not** read registry `layoutBehavior` (attach, pool, lane, messageFlow, exceptionBranch). `sizeOf` is start/end / gateway / else-task (`layout.ts`).
- No expanded subprocess, pool, or lane sizing.
- No feedback-edge corridor.
- Every semantic commit **relayouts the whole graph** (`exportProcessXml` → `layoutProcess`). Spec: “local semantic edits should relayout locally.”
- Second layout brain: `packages/bpmn-adapter/src/workflow-to-bpmn.ts` uses different sizes (event 36×36, task 100×80) and column XY from `WorkflowNode.x/y`. That path is still used when API patches `workflowJson` (`packages/api-server/src/services/processService.ts`).

No ELK. Layout-engine has no UI dependency. Good.

---

## 5. BPMN DI

**PARTIAL**

Done:

- Semantic export writes `BPMNShape` / `BPMNEdge` from layout — `packages/bpmn-adapter/src/semantic-xml.ts` `processToXml`.
- Import ignores DI (`xmlToProcess` comment and test “ignores imported coordinates”).
- `exportProcessXml` is byte-identical for the same graph (`adapter.test.ts`).

Gaps vs spec:

- **Do not reimplement XML parsing** — custom `packages/bpmn-adapter/src/xml.ts`, not `bpmn-moddle`.
- **Preserve `extensionElements`** — listed in `SKIP_TAGS`; dropped on import; export does not emit them.
- **MIWG-oriented tests** — none.
- Persistence stores whatever XML the client last saved. Editor **bootstrap relayouts** on open (`session.bootstrap` → `exportProcessXml`), so imported freeform DI is rewritten when the diagram is opened — contrary to `GAPS.md` “Stored as-is (no relayout on import)” at **list** time, but not at **editor** time.
- Legacy `workflowJson` **persists coordinates** (`packages/domain/src/types/WorkflowNode.ts` `x?` `y?`).

---

## 6. Render (bpmn-js as viewer, not source of truth)

**PARTIAL**

Done:

- Compact rail: Select, Pan, category doors — `PaletteRail.tsx`. Default bpmn-js palette hidden — `apps/web/src/index.css` `.djs-palette { display: none }`.
- Space Tool blocked (`semanticGeometry.ts` `editorActions.allowed` + CSS `.djs-space-tool`). Resize / waypoint / reconnect blocked.
- Semantic create path: catalog click → `createFromComponent` → layout XML → `importXML` (`createFromCatalog.ts`, `session.ts`).
- Contextual `+` with Decision / Wait choosers — `ContinueWith.tsx`, `CONTINUE_ACTIONS` in `registry.ts`.

Coupling (bpmn-js still an editor):

| Path | What happens |
| --- | --- |
| Sequence flow | bpmn-js `connect` / `globalConnect`, then `adoptXml` (`createFromCatalog.ts`, `BpmnEditor.tsx`). |
| Message flow | Same bpmn-js connect (not a kernel op). |
| Boundary attach | `modeling.createShape` at pixel position (`inspectorOps.ts`). No `session` commit. |
| Replace fallback | `bpmnReplace.replaceElement` then `adoptXml`. |
| Delete fallback | `editorActions.removeSelection` then `adoptXml`. |
| Move | bpmn-js move runs, then `dropSlot` snaps to semantic slot and reimports canonical XML. |

`bpmn-js-properties-panel` is a **unused** `apps/web` dependency (`package.json`). Default `PaletteProvider` is not cloned; it is CSS-hidden, which is the right direction.

CSS still names the stage `bpmn-board` / `html.is-board` (`BpmnEditor.tsx`, `AppShell.tsx`, `index.css`) — banned product language in chrome classes, not in user-facing copy.

---

## Layering checks

### UI must not be source of truth for coordinates

**PARTIAL**

- Semantic session holds the graph; DI is compiler output on commit. Drag maps to slots. Geometry commands blocked.
- Connect / attach / replace-fallback still **write bpmn-js geometry first**, then (sometimes) reparse XML.
- DB source of truth is XML (and optional `workflowJson` with XY).
- `GAPS.md`: “Layout compile is used on semantic create, not on every bpmn-js click” — still true for attach; connect at least re-adopts.

### Agent must not emit XML / DI

**MISSING** (for the agent that exists)

- Spec: tools only (`addTask`, `splitExclusive`, …) via `BpmnComponentRegistry`. Build agent **last**.
- Actual: `runBipiAssistant` system prompt requires JSON with `bpmnXml`, `replaceXml`, `replaceWorkflow`, and a **private** `kind` list (`task` / `userTask` / …) — `packages/api-server/src/ai/types.ts`, `runAssistant.ts`.
- No `@bpmn/agent-tools` package. `api-server` does not depend on `semantic-core`.
- Chat UI removed (`GAPS.md`); endpoint remains. Premature **and** wrong shape.

### Five rule layers kept separate

**PARTIAL** — typed and bucketed, but layer 2 empty and layers 1/4/5 are thin. Not one lint bag, not five real engines.

### One `BpmnComponentRegistry`

**DONE** for vocabulary — one list. Palette, inspector, Continue+, `pickCatalogItem`, and agent tools consume `@bpmn/semantic-core` `BpmnComponentRegistry` (`start.none`, `boundary.timer`, `activity.userTask`). The former web palette file is gone. Create rejects unknown ids; there is no alias map.

`implemented` (`IMPLEMENTED_COMPONENT_IDS`) is the kernel gate. Spec says **`canCreate=false` until the kernel can insert**. Registry `canCreate` is **parent/scope legality** and is `true` for unimplemented types in a process (e.g. `gateway.complex`). UI uses `implemented`, not `canCreate`. Spec mismatch remains.

Typed tasks: kernel `createFromComponent('activity.userTask')` and `implemented` include the task types. Flyout enables them.

### Layout stability

**PARTIAL** (DONE on the kernel graph)

- Identical layout/XML for same semantic input — tests cited above.
- Branch order stable when adding to one band.
- Import of unstructured / collaboration XML is lossy; relayout on editor open can move imported diagrams.

### First creatable slice

Spec `canCreate=true`: Start, End, Task **types**, XOR / AND / OR / **Event-based**, Sequence / **conditional** / **default**, **Subprocess**, **Boundary timer / error**, **Pool**, **Lane**, **Message flow**.

| Item | Registry listed | `implemented` | Kernel op | UI create |
| --- | --- | --- | --- | --- |
| Start / End none | Yes | Yes | Throws if inserted (`create.ts`) | Disabled in practice (process already has them) |
| Task | Yes | Yes | `addTask` | Semantic |
| User/Service/… tasks | Yes | **No** | `createFromComponent` works | Flyout: not in profile |
| XOR / AND / OR | Yes | Yes | `split*` | Semantic |
| Event-based | Yes | **No** | No (`maps to exclusive` on replace/import) | Hint / disabled |
| Sequence flow | Yes | Yes | Implicit on insert; no connect op | bpmn-js connect |
| Conditional / default | Yes | **No** | `setFlowKind` | Inspector (semantic + bpmn-js fallback) |
| Subprocess | Yes | **No** | No (type stored as task) | Disabled |
| Boundary timer / error | Yes | **No** | No (skipped on XML import) | Inspector bpmn-js attach |
| Pool / Lane | Yes | **No** | No | Hint |
| Message flow | Yes | **No** | No | bpmn-js connect |

Unimplemented rows are searchable and disabled with a reason (`contextFilter.ts`) — matches catalog UX spec. They are **not** hidden only in bpmn-js replace, except that replace **fallback** still uses bpmn-js for types the kernel rejects.

---

## Package map vs target

| Target package | Status | Notes |
| --- | --- | --- |
| `@bpmn/semantic-core` | **PARTIAL** | IR + ops + registry. No UI deps. Slice incomplete. |
| `@bpmn/layout-engine` | **PARTIAL** | Structured LTR + XOR bands. No registry layoutBehavior. |
| `@bpmn/rules` | **PARTIAL** | Four thin layers; no execution profile. |
| `@bpmn/bpmn-adapter` | **PARTIAL** | Two stacks: semantic-xml (good direction) and workflow-to-bpmn (XY DTO). |
| `@bpmn/web` | **PARTIAL** | Consumer + still a modeling host. Catalog is `BpmnComponentRegistry` only. |
| Agent tools | **MISSING** | Assistant lives in `api-server` and emits XML. |
| `@bpmn/domain`, `@bpmn/api-server`, `@bpmn/db` | **DONE** as persistence | XML DTO as specified “until cores land.” Cores have landed enough that XML-as-edit-model is now **debt**, not a temporary stub. |

Dependency rule (cores must not import UI): **DONE** for semantic-core, layout-engine, rules. Agent is not a core package.

---

## Coupling callouts (highest risk)

1. **bpmn-js as co-editor, not renderer** — `BpmnEditor.tsx` constructs `BpmnModeler`; connect/replace/attach/delete mutate the command stack; XML is round-tripped to resync the graph. Mixed fallback can desync until reload (`GAPS.md`; attach still never `adoptXml`).
2. **Catalog vs kernel slice** — one `BpmnComponentRegistry` list; unimplemented rows are searchable and disabled. Kernel ops still missing for subprocess / pool / lane / message flow.
3. **Assistant XML** — `replaceXml` / `bpmnXml` / private `BipiElementKind`. Violates north-star LLM rules even though the UI does not apply it yet.
4. **Three XML/layout brains** — `semantic-xml` + layout-engine; `workflow-to-bpmn` + `WorkflowNode` XY; `rules/model.ts` regex parse. Plus bpmn-js serialize on fallback.
5. **`canCreate` vs `implemented`** — legality vs kernel support collapsed incorrectly relative to the spec.
6. **Persistence of DI** — `bpmnXml` + `workflowJson.x/y` are still the stored model.

---

## Build order vs actual

Spec: kernel → regions → canonical layout → rules → editor interactions → **then** agent.

| Step | Status |
| --- | --- |
| Kernel (IR + registry) | **PARTIAL** — first slice not complete; registry is broad. |
| Structured regions | **PARTIAL** — XOR/AND/OR only; heuristic detector. |
| Canonical layout | **PARTIAL** — strong for that region model. |
| Rules | **PARTIAL** — package exists, thin. |
| Editor catalog / contextual `+` | **PARTIAL** — rail + flyout + `+`; create still mixed. |
| Agent | **Premature / wrong** — XML assistant in API; not on semantic tools. |

---

## Product UI (brief; no UX_AUDIT.md)

Home list is BPMN-native enough: previews, rule scores, describe-to-create, import — `ProcessListPage.tsx`, `ProcessRow.tsx`. Not “your boards.”

Honesty gaps: `ProcessStatus` includes `draft` / `published` / `archived` / `template` (`packages/domain/src/types/ProcessStatus.ts`) while product rules warn against invented lifecycle chrome. Editor “Save draft” is real status, not fake UI-only — still a domain choice to revisit.

Banned copy: Bipi/flow-buddy **UI** removed (`GAPS.md`). Remaining: CSS `--color-bipi-*`, class `bpmn-board`, assistant types named `Bipi*`.

---

## `GAPS.md` vs this audit

Still accurate: linear NL, unused assistant, kernel vs first-slice flags, session vs bpmn-js, bipi type names.

Stale / shifted:

- Catalog create **no longer click-to-places** unimplemented types (`createFromCatalog.ts` returns hints; tests assert no free-form create). Pool/lane are hints. Message flow still bpmn-js connect.
- Editor open **does** relayout via `bootstrap`, even if import stored XML as-is.

---

## What “done” would mean (not a roadmap)

For the north star, not extra scope:

1. UI/agent/rules/layout consume only `BpmnComponentRegistry` (done for UI + agent tools).
2. `canCreate=false` unless a kernel op exists; first-slice flags match the spec table.
3. IR + ops for event-based, subprocess scope, boundary timer/error, pool/lane, message flow; stop coercing them to `task` / XOR.
4. Adapter: `bpmn-moddle` (or equivalent), preserve IDs + `extensionElements`, MIWG tests; drop `workflow-to-bpmn` XY.
5. Persist graph (or XML generated only at export); never store drag XY as intent.
6. bpmn-js: import compiled DI only; no connect/replace/attach fallback.
7. Five real rule layers; layer 2 reads `engineSupport`.
8. Agent last: wrap `ops.ts` only; delete `replaceXml` / `bpmnXml` from the assistant contract.
