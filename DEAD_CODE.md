# Dead-code audit (conservative)

Scope: first-party `apps/` and `packages/` (not `node_modules` / `dist`).  
Rule: delete only with **zero imports**, and never sibling in-flight work (`packages/agent-tools`, `packages/simulate`, layout-engine wire, `apps/web` simulate views).  
`@bpmn/semantic-core` **public** exports in `packages/semantic-core/src/index.ts` were not removed.

## Removed

| Item | Proof |
| --- | --- |
| `apps/web/src/components/bpmn-editor/index.ts` | Barrel. Callers import `BpmnEditor` from `./BpmnEditor`. Zero imports of the barrel. |
| `apps/web/src/components/shell/index.ts` | Barrel. Callers import `AppShell` / `EditorChrome` from the files. Zero imports of the barrel. |
| `apps/web/tsconfig.tsbuildinfo` | Stale incremental cache still listed deleted `src/components/bipi/*` files. Not source. |
| Unused `export` on same-file helpers | Zero cross-file imports: `CATALOG_BY_ID`, `linearSemanticProcess`, `isPoolOrLane`, `isImplementedCatalogId`, `ATTACH_IDS`, `eventDefinitionName`, `isNonInterrupting`, `isCurrentDef`. |

Already gone before this pass (not re-deleted):

- **AiPanel / Bipi UI** (`apps/web/src/components/bipi/*`) — no source files remain. `GAPS.md` records the removal.
- **`apps/web/.../palette/registry.ts`** — deleted. Palette / inspector / Continue+ / `pickCatalogItem` consume `BpmnComponentRegistry` from `@bpmn/semantic-core`. Presentation (`iconClassFor`, `createKind`) is derived from registry defs.
- **`--color-bipi-*` / unused mint-blush-shadow-radius tokens** — already flattened to `--color-ink` etc. in `apps/web/src/index.css`.
- **`html.is-board` / `.bpmn-board`** — already renamed to `is-editor` / `.bpmn-stage`.
- **`bpmn-js-properties-panel`** — not in `apps/web/package.json`.

## Left on purpose

### In-flight siblings (do not delete)

- `packages/agent-tools/**` — new agent tool surface.
- `packages/simulate/**` and `apps/web/src/components/bpmn-editor/simulate/**` — token simulation.
- `packages/layout-engine/**` — layout compile; wired from adapter + editor session.
- `packages/rules/src/naming.ts` — used by `lintProcess`.
- `.token-badge` / `.sim-choice` in `apps/web/src/index.css` — used by `tokenView.ts`.

### Used (looks duplicate / leftover, still imported)

- **`bpmnToWorkflow` / `workflowToBpmn`** — not stubs. Used by `processService` + `seed` + adapter tests. Semantic XML (`xmlToProcess` / `exportProcessXml`) is the kernel path; workflow JSON remains the persistence DTO.
- **Duplicate `DEFAULT_BPMN_XML`** — `apps/web/.../defaultBpmnXml.ts` and `packages/api-server/src/defaultBpmn.ts` are both imported.
- **`packages/api-server` `Bipi*` types / `runBipiAssistant`** — live `POST /api/assistant`. Editor does not apply actions yet (`GAPS.md`). Rename is branding, not unused. Agent workstream still consumes this route.
- **`apps/web/src/components/ui/index.ts`** — imported by `EditorChrome`.
- **Audits / honesty** — `GAPS.md`, `ARCHITECTURE.md`, `UX_AUDIT.md`, `ARCHITECTURE_AUDIT.md` kept.

### Unused exports (not deleted)

Same-file or package-internal `export` that other packages or tests may still want. Not proven safe as a public-API shrink:

| Location | Names | Why left |
| --- | --- | --- |
| `packages/semantic-core/src/index.ts` | `get`, `search`, `listByCategory`, `canCreate`, ops not yet used by the editor | Public kernel API — do not revert. |
| `packages/semantic-core/src/components/define.ts` | `sourceOk`, `targetOk`, unused set re-exports (`ACTIVITY_SET`, …) | Internal catalog helpers; some sets *are* imported by `connectors.ts`. |
| `packages/semantic-core/src/graph.ts` / `ids.ts` | `uniqueOutgoing`, `allIds` | Used inside the package. |
| `packages/layout-engine` | `isSemanticProcess` (module-level) | Used by `fromSemanticProcess`. `fromSemanticProcess` / `layout` stay public. |
| `packages/bpmn-adapter` | `processToXml` | Used by `exportProcessXml`; re-exported. |
| `packages/domain` | `WorkflowValidationResult` | Return type of `validateWorkflowDocument`. |
| `packages/api-server` | `PROCESS_LIST_*` constants, `AiProviderName` | Same-file / route helpers. |
| `apps/web` palette / session | `FilterContext`, `PickResult`, `SemanticCreate`, `DropSlot`, `DiagramWriter`, `CatalogCreateKind`, `ContinueAction` | Types on live modules. |
| `apps/web/src/lib/api.ts` | `ProcessListParams`, `ProcessListResponse` | API DTO types. |
| `apps/web` inspector | `ReplaceOptionView` | Return shape of exported `changeToOptions`. |
| `palette.css` `.djs-context-pad { display: none }` | Duplicate of `index.css` hide | Harmless; not unused. |

### Product-language leftovers (used)

- Assistant prompt still says “Bipi” in history labels (`runAssistant.ts`). Not unused.
- `ARCHITECTURE_AUDIT.md` still mentions `--color-bipi-*` / `bpmn-board`; source CSS has already been renamed.

## TODOs

No first-party `TODO` / `FIXME` in `apps/` or `packages/` source. Hits were only in `node_modules`.

## Checks

`pnpm test` after the deletes: **122 passed, 8 failed** (26 files, 4 failing).

Failures are **not** from this cleanup (barrels / unexports). They sit in in-flight sibling packages:

- `xmlToProcess` is now `async`; `session.ts` and adapter tests still treat it as sync (`process.nodes` undefined).
- `packages/simulate` exclusive-split test (`no token at ExclusiveGateway_1`).
- `POST` process `status: 'draft'` returns 400 in `processes.test.ts`.

This audit did not patch those.
