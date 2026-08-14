# Gaps — honest status

Layout-wire and rules own their packages. This file is product honesty, not a roadmap.

## Done

- **Home list** — search, kind/sort, pagination, blank Start → Task → End, editor, save draft / save as template.
- **Import BPMN** — header, empty state, New dialog. Rejects files without `<definitions>`. Stored as-is (no relayout on import).
- **Templates** — `GET /api/templates` on home with **Use template** (`templateId`). Kind=template still opens the template record.
- **Describe-to-create** — text is `description`; first line is the name. Builds Start → tasks → End via semantic-core (`then` / newlines / `;`). If/otherwise, passed/failed, or yes/no pairs call `splitExclusive` (two named branches + tasks). Not AND/OR, not LLM XML.
- **Catalog create** — palette click → `pickCatalogItem` → semantic session (`createFromComponent` + layout XML) for Start / End, typed tasks, XOR / AND / OR, event-based, boundary timer, sequence flow. Enablement is `BpmnComponentRegistry.implemented`. Unimplemented rows stay searchable and disabled.
- **One catalog** — UI / agent / kernel use `BpmnComponentRegistry` ids only (`start.none`, `boundary.timer`). No web palette list, no create-time aliases.
- **Rule scores** — list rows and inspector show `@bpmn/rules` findings (rules workstream).
- **Architect apply** — inspector composer posts the current semantic graph to `POST /api/assistant`, then `session.applyProcess` / `applyPlan` + layout (same commit path as catalog create). Diff is semantic (Added XOR, branches), not XML. No mascot panel.
- **Dead UI** — Bipi / flow-buddy panel removed. Unused `bpmn-js-properties-panel` removed. `--color-bipi-*` tokens flattened. List shows existing `status` only when it is not `draft` — no invented lifecycle chrome.

## Still fake / missing

- **NL → process** — heuristic XOR only. No LLM → gateways. No AND/OR from describe.
- **Kernel first slice incomplete** — no semantic create for subprocess, pool, lane, message flow. Those rows are search-only. Inspector can attach a boundary in bpmn-js as a fallback; kernel create is `boundary.timer`.
- **Round-trip** — editor bootstrap compiles through the semantic graph. Pools, lanes, message flows, and boundaries in imported XML can be dropped on open / next layout compile.
