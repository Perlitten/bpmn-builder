# Architecture — Semantic BPMN 2.0 Builder

Users edit **process semantics**. The diagram is a deterministic rendering of a structured process graph. BPMN 2.0.2 is the interchange standard; pixel geometry is a **product** style, not OMG.

This is **not** a board, whiteboard, or infinite canvas. Product copy must not promise freeform / drag-anywhere drawing. Layout is canonical. UI contract: `.cursor/rules/product-ui-bpmn-native.mdc`.

Normative agent rules: `.cursor/rules/semantic-bpmn-north-star.mdc`. Component vocabulary: `.cursor/rules/semantic-component-library.mdc`.

## Pipeline

```text
Intent
  → Semantic Process Graph (IR)
  → BPMN + style + execution validation
  → Structured Layout (regions / slots / routing)
  → BPMN DI (bounds + waypoints)
  → bpmn-js render
```

BPMN XML is import/export, not the editing model. Same semantic graph + same tokens ⇒ **byte-identical** geometry (not ±3 px). Local semantic edits should relayout locally; branch order is stable.

`bpmn-js` / `bpmn-moddle` render and serialize. Do not reimplement XML parsing. Do not give ELK (or any generic graph optimizer) final authority over structured BPMN.

## Intermediate representation

| Type | Role |
| --- | --- |
| `Process` | Root process (semantic graph). Persistence DTO with `bpmnXml` stays in `@bpmn/domain` until cores land. |
| `Scope` | Process or subprocess boundary |
| `Participant` / `Lane` | Collaboration + responsibility |
| `FlowNode` | Start / end / task / XOR / AND / OR / Event-based (catalog ids; later: more) |
| `Activity` / `Event` / `Gateway` / `Subprocess` | Typed flow nodes |
| `SequenceFlow` | Control flow **inside** one process (plain / conditional / default) |
| `MessageFlow` | Interaction **between** participants |
| `StructuredRegion` | Layout primitive: `split`, `join`, `branches[]`, nested regions, scope |
| `Branch` | Ordered path inside a region (stable id + order) |
| `FeedbackEdge` | Loop / back edge; routed in a dedicated corridor |
| Unstructured mark | Split/join cannot be paired; do not fake a region |

Detect split/join with reachability + dominators/post-dominators + gateway type + scope. IR has **no coordinates**.

Semantic ops (examples): `createProcess`, `addTask`, `addAfter` / `addBefore`, `removeElement`, `renameElement`, `splitExclusive` (join created with split), `addBranch`, `moveToBranch`. Agent tools wrap these; they never write DI. Creation resolves `BpmnComponentRegistry` ids — UI, agent, validation, and layout share that vocabulary.

## Layout tokens (product, tunable)

Spacing is between **shape boundaries**, not centers, so Task→Task and Event→Task get the same visible connector length.

| Token | Value |
| --- | --- |
| `baseGrid` | 8 px |
| Task | 120 × 72 |
| Gateway | 48 × 48 |
| Event | 40 × 40 |
| `FLOW_GAP` / `forwardFlowGap` | 96 px between boundaries |
| `branchGap` | 64 px |
| `edgeClearance` | 24 px |

Happy path: one LTR baseline. Forward sequence flow: orthogonal 90° only. Expanded subprocess / pool size is computed. Manual lock stores a **semantic slot** (`branch`, `order`, `lane`), never XY.

## Five rule layers

1. **BPMN compliance** — OMG 2.0.2 connectivity, scopes, XML/DI validity
2. **Execution profile** — Camunda 8 / Zeebe / neutral subset
3. **Modeling style** — explicit start/end/split/join, happy path, naming
4. **Geometry** — tokens, bands, corridors, no-cross, label placement
5. **Quality heuristics** — nesting, branch explosion, mixed business/tech level

Findings: ERROR / WARNING / STYLE / SUGGESTION. Quality scores are deterministic, never an opaque LLM number.

## Package map (target)

| Package | Responsibility |
| --- | --- |
| `packages/semantic-core` (`@bpmn/semantic-core`) | IR + pure undoable semantic operations + **`BpmnComponentRegistry`**. **No DI.** Source of truth for the graph and the component vocabulary. Split to `@bpmn/components` only if the registry must ship without the kernel — still one list. |
| `packages/layout-engine` (`@bpmn/layout-engine`) | Structured graph → deterministic bounds + waypoints. Reads `layoutBehavior` from the registry. |
| `packages/rules` (`@bpmn/rules`) | Five layers; quality scores; no UI. Uses registry `canCreate` / parents / engineSupport. |
| `packages/bpmn-adapter` (`@bpmn/bpmn-adapter`) | XML ⇄ semantic graph round-trip; preserve IDs and `extensionElements`; MIWG-oriented tests |
| `apps/web` (`@bpmn/web`) | Consumer/controller: header, templates, render via bpmn-js. Catalog UI consumes the registry — never a second vocabulary. Not the layout brain. BPMN-native UI only — never a generic “board”. |

Existing until migration: `@bpmn/domain` (persistence DTOs, including `Process.bpmnXml`), `@bpmn/api-server`, `@bpmn/db`. Do not duplicate a conflicting `Process` type; keep the XML DTO in domain and put graph IR in `semantic-core`.

**Dependency rule:** semantic-core, layout-engine, rules, and agent tools must not import UI. Same core must serve web, CLI, MCP, CI.

## Semantic Component Library

This product is **not** a bpmn-js skin. Default `PaletteProvider` keeps a short strip (hand / lasso / space / connect + generic start / intermediate / end / gateway / task / subprocess / data / pool / group) and hides the real vocabulary in **Replace/Change menu**. That is enough for bpmn-js. It is **not** enough here: users and agents must choose BPMN **meaning**.

Do **not** clone or extend that palette into a 50-icon SAP toolbar.

### Compact toolbar = catalog navigation

Left rail is doors into a searchable catalog, not a figure list:

```text
Select · Pan · Add
Events ›  Activities ›  Gateways ›  Flows ›  Participants ›  Data ›  Artifacts
```

Category flyout: grouped entries + search over `title`, `semanticMeaning`, and `agentHints`. Unimplemented rows stay visible, disabled, with a reason.

### One `BpmnComponentRegistry`

UI, agent, validation, and layout **must** share one vocabulary. No private type lists.

```text
BpmnComponentDefinition {
  id                  // e.g. boundary.timer
  bpmnType            // BPMN 2.0 element name
  eventDefinition?    // TimerEventDefinition, …
  category            // events | activities | gateways | flows | participants | data | artifacts
  title
  icon                // key, not a React node
  allowedParents / allowedSources / allowedTargets
  canCreate(context) / canAttach(context) / canReplace(element)
  semanticMeaning
  agentHints { useFor[], doNotUseFor[] }
  layoutBehavior      // e.g. attachToActivityBoundary, exceptionBranch
  engineSupport       // camunda8 | zeebe | neutral | …
}
```

`canCreate=false` until the kernel can insert the type. The entry remains searchable. Space Tool is **not** a component.

Example — timer boundary:

```text
id: boundary.timer
semanticMeaning: Something happens after/during time while an activity is active.
layoutBehavior: attachToActivityBoundary; exceptionBranch = true
agentHints.useFor: timeout during activity, SLA expiration, retry delay on running work
agentHints.doNotUseFor: competing future events after the activity has completed
```

API (target): `listByCategory()`, `search(query)`, `get(id)`, `canCreate(id, context)`.

### Three creation paths (same registry)

1. **Palette catalog** — user picks a construction (User Task, Event-Based Gateway, Message Flow, …).
2. **Contextual `+`** — after a node, only legal continuations. “Decision” is UI copy that resolves to XOR / OR / AND / Event-based. “Wait for event” → event-based or intermediate catch, per context.
3. **Agent** — NL (“wait for payment or cancel”) maps via `agentHints` to the same ids and semantic ops.

### Context filtering

Catalog and `+` hide or disable illegal placements. Cancel end event: only inside a **transaction**. Boundary / start variants follow the same parent/scope rules. This is a **semantically legal** catalog, not a sticker sheet.

### Geometry tools (ban vs rewrite)

| Tool | Law |
| --- | --- |
| **Space Tool** | **Remove.** It exists to shove pixels in free-layout bpmn-js. Canonical layout owns space. |
| Lasso / multi-select | Allowed as **selection**, not as a modeling product. |
| Hand / Pan | Allowed. |
| Global connect | Allowed only if it picks a **legal BPMN flow** (sequence / conditional / default / message / association) from the registry and the layout engine **routes canonically**. Never free Visio arrows. |

### Catalog groups (discoverable vocabulary)

Not every row is creatable in the first kernel slice. All remain in the registry with `semanticMeaning`.

| Category | Includes (non-exhaustive) |
| --- | --- |
| Events | Start none/message/timer/conditional/signal; intermediate catch/throw (message, timer, escalation, conditional, link, compensation, signal); boundary (message, timer, escalation, conditional, error, cancel, signal, compensation + non-interrupting where legal); end none/message/error/escalation/cancel/compensation/signal/terminate |
| Activities | Task, User, Service, Send, Receive, Manual, Business Rule, Script; Subprocess, Event Subprocess, Transaction, Ad-hoc; Call Activity |
| Gateways | Exclusive (XOR), Parallel (AND), Inclusive (OR), Complex, Event-based |
| Flows | Sequence, conditional, default; message flow; association / data association |
| Participants | Pool, Lane |
| Data | Data object, data store |
| Artifacts | Group, text annotation |

### First creatable slice (`canCreate=true`)

Start, End, Task (**task types as distinct registry entries**), XOR / AND / OR / Event-based, Sequence / conditional / default flow, Subprocess, Boundary timer / error, Pool, Lane, Message flow.

Everything else: listed, searchable, `canCreate=false` until kernel ops exist. Unknown BPMN still **round-trips** (stable IDs, `extensionElements`).

### Acceptance

The editor must expose the modeling-profile vocabulary. It **must not** show every variant as a flat vertical toolbar. The compact toolbar is navigation into the catalog.

No supported component may exist only as a hidden bpmn-js replace-menu detail.

Every supported component is:

- discoverable by a human
- searchable by name and meaning
- creatable through the semantic API
- available to the AI agent
- validated contextually
- understood by the layout engine

## Build order

kernel (IR + registry) → regions → canonical layout → rules → editor interactions (catalog / contextual `+`) → **then** agent.

## Out of scope for architecture-only work

Do not implement engines in a docs-only change. Do not start a server. Do not open the OS browser. Do not ship a PaletteProvider clone “for now”.
