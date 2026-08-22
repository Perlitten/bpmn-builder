# Gaps — honest status

Updated 2026-08-22. This is the maintained product/architecture gap list; historical audit files are evidence snapshots, not current status.

## Confirmed working

- **Semantic edit path** — the catalog and Architect apply semantic operations through `@bpmn/semantic-core`, then deterministic layout and BPMN XML generation.
- **BPMN import/round-trip** — the adapter uses `bpmn-moddle`; extension elements, boundary events, subprocess scopes, pools, lanes, and message flows have round-trip coverage.
- **Execution profiles** — rules consume registry `engineSupport` for execution-profile diagnostics.
- **Implemented catalog slice** — subprocess/event-subprocess/transaction/ad-hoc, call activity, supported boundaries/events/gateways, participants/lanes, message flow, and artifacts are available through the semantic registry.
- **Agent boundary** — the model emits semantic tool plans; raw `bpmnXml`, `workflowJson`, and geometry-bearing replacement plans are rejected.
- **Product UX basics** — real BPMN mini-previews, list quality signals, BPMN download, modal focus containment, semantic rail labels, and blocked bpmn-js global-connect/legacy keyboard actions are implemented and tested.

## Open architecture debt

- **bpmn-js fallback mutations** — replace, delete, and boundary attach still have a bpmn-js/adopt-XML fallback after the semantic operation fails. The fallback preserves usability but means the compiler is not yet the only editor.
- **Full relayout** — semantic commits rebuild the full layout. Local relayout and a dedicated feedback-edge corridor are not implemented.
- **Legacy persistence projection** — records store canonical `bpmnXml` plus a derived `workflowJson` projection containing layout coordinates. Removing it requires an explicit data migration/compatibility plan.
- **Multiple interpretation paths** — the canonical adapter uses `bpmn-moddle`, while rules and the legacy workflow projection retain their own model/parsing paths.
- **Registry capability contract** — `implemented` gates the UI/kernel, while registry `canCreate` can still describe legal context for an unimplemented definition. Consolidating these semantics would change current fallback behavior and needs a deliberate migration.

## Open operational debt

- **Global Architect quota** — code enforces per-user concurrency/RPM per serverless instance. A shared limiter or Vercel Firewall rule is still required only if a deployment needs a global quota across instances.
- **Cold-start migrations/repair** — Vercel initializes migrations on the first request per instance. Empty-diagram repair now queries only broken rows, but migrations should move to a dedicated deploy step if they become non-trivial.
- **Branch protection** — CI is comprehensive, but required checks and merge protection are GitHub repository settings and must be verified outside the codebase.

## Explicit non-gaps

- Supporting BPMN 2.0 XML does **not** mean an exported model executes unchanged in Camunda, Zeebe, Flowable, or every BPMN tool. Engine compatibility depends on supported elements and vendor extensions.
- `workflowJson`/coordinates are architectural debt, not proof that the semantic compiler or deterministic layout is absent.
