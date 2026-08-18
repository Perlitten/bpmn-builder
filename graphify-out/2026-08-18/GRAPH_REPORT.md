# Graph Report - BPMN 2.0  (2026-08-18)

## Corpus Check
- 323 files · ~151,439 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2422 nodes · 6147 edges · 131 communities (117 shown, 14 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 50 edges (avg confidence: 0.6)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5411854f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- layout.ts
- architectPosition.ts
- describeProcess.ts
- inspectorModel.ts
- assistant.ts
- preserve.ts
- Process
- define.ts
- catalogPresentation.ts
- bpmnPreview.ts
- collaboration.ts
- semantic-xml.ts
- domain/src/index.ts
- ops.ts
- session.ts
- ProcessListPage.tsx
- lintProcess.ts
- scope.ts
- semantic-core/src/index.ts
- ProcessEditorPage.tsx
- inspectorOps.ts
- Button.tsx
- BpmnComponentRegistry
- bpmn-adapter/src/index.ts
- BpmnEditor.tsx
- contextFilter.ts
- processService.ts
- model.ts
- naming.ts
- runAssistant.ts
- simulate.ts
- useModal
- ProcessRow.tsx
- agent-tools/src/index.ts
- devDependencies
- @bpmn/bpmn-adapter
- bpmn-adapter/package.json
- ArchitectPanel.tsx
- selectMarquee.ts
- package.json
- xmlToProcess
- hostKeyboard.ts
- tools.ts
- db/src/index.ts
- dependencies
- create.ts
- P2 — polish
- db/package.json
- compilerOptions
- dependencies
- workflow.ts
- semanticGeometry.ts
- exportDiagram.ts
- ElementInspector.tsx
- execution.ts
- simulate/package.json
- agent-tools/package.json
- createSemanticEditor
- NewProcessDialog.tsx
- api-server/tsconfig.json
- applyXmlToViewer.ts
- What You Must Do When Invoked
- processListQuery.ts
- domain/package.json
- layout-engine/package.json
- rules/package.json
- semantic-core/package.json
- services/errors.ts
- BpmnModdle
- App.tsx
- Architecture audit — Semantic BPMN north star
- Architecture — Semantic BPMN 2.0 Builder
- CatalogFlyout.tsx
- tsconfig.json
- applyAssistant.ts
- passwordGate.ts
- onboardingStorage.ts
- diagramElement.ts
- web/tsconfig.json
- agent-tools/tsconfig.json
- miwg.roundtrip.test.ts
- bpmn-adapter/tsconfig.json
- db/tsconfig.json
- domain/tsconfig.json
- layout-engine/tsconfig.json
- rules/tsconfig.json
- semantic-core/tsconfig.json
- simulate/tsconfig.json
- vercel.json
- api.ts
- createTokenView
- ElementInspector.test.ts
- PressedToggle.tsx
- Dead-code audit (conservative)
- eventLabelCss.test.ts
- BPMN 2.0 Builder
- web/package.json
- graphify reference: extra exports and benchmark
- layout.test.ts
- placeRegion
- Design QA — BPMN palette and Architect mascot
- usableXml.ts
- bpmn-js
- graphify reference: query, path, explain
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- Gaps — honest status
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- graphify
- semanticAdapter.ts
- @bpmn/domain
- lucide-react
- react
- svg2pdf.js
- CLAUDE.md
- .claude/CLAUDE.md
- extraction-spec.md
- typedTaskPaint.ts
- graph.ts
- route.ts

## God Nodes (most connected - your core abstractions)
1. `BpmnEditor` - 56 edges
2. `Process` - 53 edges
3. `createProcess()` - 45 edges
4. `getNode()` - 44 edges
5. `createFromComponent()` - 43 edges
6. `addTask()` - 37 edges
7. `xmlToProcess()` - 35 edges
8. `BpmnComponentRegistry` - 35 edges
9. `outgoingFlows()` - 31 edges
10. `allRegions()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `initializeDatabase()` --calls--> `seedIfEmpty()`  [EXTRACTED]
  api/index.ts → packages/api-server/src/seed.ts
- `BpmnEditor` --calls--> `lintProcess()`  [EXTRACTED]
  apps/web/src/components/bpmn-editor/BpmnEditor.tsx → packages/rules/src/lintProcess.ts
- `BpmnEditor` --calls--> `replaceBpmnType()`  [EXTRACTED]
  apps/web/src/components/bpmn-editor/BpmnEditor.tsx → packages/semantic-core/src/ops.ts
- `BpmnEditor` --calls--> `createTokenSimulation()`  [EXTRACTED]
  apps/web/src/components/bpmn-editor/BpmnEditor.tsx → packages/simulate/src/simulate.ts
- `BpmnEditor` --calls--> `describeSimulation()`  [EXTRACTED]
  apps/web/src/components/bpmn-editor/BpmnEditor.tsx → packages/simulate/src/simulate.ts

## Import Cycles
- None detected.

## Communities (131 total, 14 thin omitted)

### Community 0 - "layout.ts"
Cohesion: 0.11
Nodes (38): applyLaneBands(), artifactSize(), bandStack(), buildMainChain(), ceilToGrid(), ChainItem, clearOfLabels(), clusterOwners() (+30 more)

### Community 1 - "architectPosition.ts"
Cohesion: 0.06
Nodes (71): ARCHITECT_COMPANION_HEIGHT, ARCHITECT_COMPANION_WIDTH, ARCHITECT_DRAG_THRESHOLD_PX, ARCHITECT_OPEN_KEY, ARCHITECT_STORAGE_KEY, architectStorage(), ArchitectSurface, between() (+63 more)

### Community 2 - "describeProcess.ts"
Cohesion: 0.06
Nodes (61): ArchitectComposeKey, isArchitectComposeSubmitKey(), isImeComposing(), enter, ArchitectMascot(), ArchitectMascotProps, ListArchitect(), ListArchitectProps (+53 more)

### Community 3 - "inspectorModel.ts"
Cohesion: 0.12
Nodes (34): ElementInspector(), ATTACH_IDS, attachActions(), changeToOptions(), currentComponentId(), elementName(), eventDefinitionName(), findMatchingReplaceTarget() (+26 more)

### Community 4 - "assistant.ts"
Cohesion: 0.10
Nodes (40): isToolPlanError(), friendlyAiError(), isConfigError(), isUpstreamError(), createGeminiClient(), createNvidiaClient(), NvidiaResponse, NvidiaStreamDelta (+32 more)

### Community 5 - "preserve.ts"
Cohesion: 0.15
Nodes (36): bpmnTypeOf(), isActivityType(), isTimerElement(), PreservedField, preservedFieldsFor(), apply(), asRecord(), assignPreserve() (+28 more)

### Community 6 - "Process"
Cohesion: 0.11
Nodes (24): withSplit(), twoLaneTasks(), xorXml(), ADD_TASK_LAYOUT, attrCount(), STRESS, stressCounters(), tagCount() (+16 more)

### Community 7 - "define.ts"
Cohesion: 0.08
Nodes (56): BPMN_COMPONENT_CATALOG, ARTIFACTS, DATA, FLOWS, PARTICIPANTS, sequenceLike(), ACTIVITY_SET, ACTIVITY_TYPES (+48 more)

### Community 8 - "catalogPresentation.ts"
Cohesion: 0.15
Nodes (11): CatalogCreateKind, CATEGORY_LABEL, EVENT_GLYPH, eventIcon(), iconClassFor(), PALETTE_CATEGORIES, PaletteCategoryId, TYPE_ICON (+3 more)

### Community 9 - "bpmnPreview.ts"
Cohesion: 0.07
Nodes (41): BpmnSchematic(), BpmnSchematicProps, useLayoutPreview(), attrs(), BpmnPreview, collapseSubprocesses(), collectProcessBodies(), collectTags() (+33 more)

### Community 10 - "collaboration.ts"
Cohesion: 0.17
Nodes (26): addAssociation(), addDataObject(), addDataStore(), addGroup(), addTextAnnotation(), apply(), artifactId(), extras() (+18 more)

### Community 11 - "semantic-xml.ts"
Cohesion: 0.13
Nodes (38): appendExtras(), applyPreserve(), applyXmlns(), ARTIFACT_TYPES, createModdle(), decodeValue(), fromPlain(), guessUri() (+30 more)

### Community 12 - "domain/src/index.ts"
Cohesion: 0.14
Nodes (25): Process, WorkflowDocument, ProcessStatus, WorkflowEdge, CORE_WORKFLOW_NODE_TYPES, WorkflowNode, isNonEmptyString(), isProcessStatus() (+17 more)

### Community 13 - "ops.ts"
Cohesion: 0.14
Nodes (31): adoptLane(), insertOnFlow(), InsertSpec, addAfter(), addBefore(), addBranch(), addOnFlow(), apply() (+23 more)

### Community 14 - "session.ts"
Cohesion: 0.12
Nodes (24): area(), contains(), cy(), dropSlot, laneForDrop(), lastNodeLeftOf(), pickBranch(), reorderSlot() (+16 more)

### Community 15 - "ProcessListPage.tsx"
Cohesion: 0.12
Nodes (30): ListKindTabs(), ListKindTabsProps, ListPaginationFooter(), ListPaginationFooterProps, lastListPage(), LIST_PANEL_ID, LIST_SORTS, LIST_TAB_ID (+22 more)

### Community 16 - "lintProcess.ts"
Cohesion: 0.11
Nodes (34): chipTone(), ScoreChips(), ScoreChipsProps, lint(), executionScore(), clamp(), formatScores(), isEventDef() (+26 more)

### Community 17 - "scope.ts"
Cohesion: 0.13
Nodes (33): applyScopeDefaults(), assertLocksIntact(), assertMutationAllowed(), assertOutsideScopeIntact(), branchById(), branchHas(), branchMutable(), canInsertAfter() (+25 more)

### Community 18 - "semantic-core/src/index.ts"
Cohesion: 0.11
Nodes (38): canReach(), compatibleJoin(), containsSplit(), findJoin(), isContainerKind(), isSplitType(), KIND, Memo (+30 more)

### Community 19 - "ProcessEditorPage.tsx"
Cohesion: 0.21
Nodes (15): BpmnEditorHandle, fetchProcess(), request(), saveAsTemplate(), saveProcess(), bpmnDownloadFilename(), downloadBlob(), downloadBpmnXml() (+7 more)

### Community 20 - "inspectorOps.ts"
Cohesion: 0.14
Nodes (23): applyFlowKind(), applyViewerLabel(), attachBoundary(), BpmnFactory, BpmnReplace, canDeleteElement(), canReplaceWithBpmnJs(), deleteSelection() (+15 more)

### Community 21 - "Button.tsx"
Cohesion: 0.12
Nodes (20): chromeProps, dir, EditorChrome(), EditorChromeProps, Button(), ButtonProps, sizes, variants (+12 more)

### Community 22 - "BpmnComponentRegistry"
Cohesion: 0.20
Nodes (7): ReplaceTargetShape, BPMN_JS_TARGETS, bpmnJsReplacePayload(), BpmnComponentRegistry, haystack(), BpmnComponentDefinition, ReplaceTarget

### Community 23 - "bpmn-adapter/src/index.ts"
Cohesion: 0.14
Nodes (27): archiveMessage(), BPMN_20_MODEL_NS, BPMN_20_NS, BpmnImportCode, BpmnImportError, BpmnSniffResult, bpmnXmlShapeError(), CONVENTIONAL (+19 more)

### Community 24 - "BpmnEditor.tsx"
Cohesion: 0.09
Nodes (32): BpmnCanvas, BpmnEditor, BpmnEditorProps, CanvasService, Dragging, EventBus, fitRemaining(), HandTool (+24 more)

### Community 25 - "contextFilter.ts"
Cohesion: 0.19
Nodes (14): isBpmnType(), catalogGroup(), createKind(), contextReason(), FilterContext, isActivity(), isPoolOrLane(), isSequenceFlowSource() (+6 more)

### Community 26 - "processService.ts"
Cohesion: 0.18
Nodes (29): DEFAULT_BPMN_XML, registerProcessRoutes(), SEED_PROCESSES, seedIfEmpty(), sendProcessError(), assertPatch(), assertPersisted(), countProcesses() (+21 more)

### Community 27 - "model.ts"
Cohesion: 0.13
Nodes (28): attrs(), Bounds, bpmnTypeFromTag(), cancelActivityFrom(), collect(), CORE_TYPE, decode(), emptyModel() (+20 more)

### Community 28 - "naming.ts"
Cohesion: 0.19
Nodes (24): ACTION_VERBS, asEndState(), asQuestion(), asStartState(), asTask(), capitalize(), elementKind(), firstMeaningful() (+16 more)

### Community 29 - "runAssistant.ts"
Cohesion: 0.16
Nodes (22): isSemanticProcess(), AGENT_SKIP_CREATE, COLLAB_COMPONENT_IDS, COLLAB_TOOLS, collaborationRequested(), constrainToolPlan(), creatableConstructions(), createComponentIds() (+14 more)

### Community 30 - "simulate.ts"
Cohesion: 0.13
Nodes (32): Canvas, Modeler, Overlays, TokenView, isEventSubProcess(), choiceKind(), completedCount(), createTokenSimulation() (+24 more)

### Community 31 - "useModal"
Cohesion: 0.15
Nodes (17): DuplicateProcessDialog(), DuplicateProcessDialogProps, DuplicateDialogDecision, duplicateRequestFromDialog(), RenameProcessDialog(), RenameProcessDialogProps, TextField(), TextFieldProps (+9 more)

### Community 32 - "ProcessRow.tsx"
Cohesion: 0.15
Nodes (18): counted(), listQualitySignal, signal(), analyzeRow(), ProcessRow, ProcessRowProps, RowAnalysis, rowAnalysisCache (+10 more)

### Community 33 - "agent-tools/src/index.ts"
Cohesion: 0.20
Nodes (20): branchView(), flowView(), inspectBranchView(), inspectRegionView(), nodeView(), processView(), regionView(), AGENT_SCOPE_KINDS (+12 more)

### Community 34 - "devDependencies"
Cohesion: 0.13
Nodes (15): devDependencies, tailwindcss, @tailwindcss/vite, @types/react, @types/react-dom, typescript, vite, @vitejs/plugin-react (+7 more)

### Community 36 - "bpmn-adapter/package.json"
Cohesion: 0.09
Nodes (21): bpmn-moddle, moddle-xml, dependencies, @bpmn/domain, @bpmn/layout-engine, bpmn-moddle, @bpmn/semantic-core, moddle-xml (+13 more)

### Community 37 - "ArchitectPanel.tsx"
Cohesion: 0.21
Nodes (18): AGENT_SCOPE_OPTIONS, AgentContext, buildAssistantScope(), locate(), resolveAgentContext(), scopeOptionEnabled(), ArchitectPanel(), ArchitectPanelProps (+10 more)

### Community 38 - "selectMarquee.ts"
Cohesion: 0.15
Nodes (15): selectableElement(), createSelectMarqueeModule(), DiagramNode, EditorTool, EventBus, HandTool, isMarqueeSurface(), LassoTool (+7 more)

### Community 39 - "package.json"
Cohesion: 0.06
Nodes (33): dependencies, @bpmn/db, express, @vercel/functions, devDependencies, @types/express, @types/node, typescript (+25 more)

### Community 40 - "xmlToProcess"
Cohesion: 0.20
Nodes (24): idOf(), isType(), refId(), refOf(), snapshotExtensions(), snapshotPreserve(), toPlain(), xmlnsAttrs() (+16 more)

### Community 41 - "hostKeyboard.ts"
Cohesion: 0.21
Nodes (17): applySpacePanDown(), applySpacePanUp(), bindKeyboardToHost(), createSpacePanHold(), EditorTool, isCopyKey(), isImeComposing(), isMod() (+9 more)

### Community 42 - "tools.ts"
Cohesion: 0.11
Nodes (27): ToolPlanError, userFacingPlanError(), assertNoGeometry(), GEOMETRY_KEYS, looksLikeBpmnXml(), walk(), xorProcess(), addAfter() (+19 more)

### Community 43 - "db/src/index.ts"
Cohesion: 0.10
Nodes (26): app, initializeDatabase(), createApp(), repoRoot, __dirname, PORT, repoRoot, startServer() (+18 more)

### Community 44 - "dependencies"
Cohesion: 0.05
Nodes (38): dependencies, @bpmn/agent-tools, @bpmn/bpmn-adapter, @bpmn/db, @bpmn/domain, @bpmn/semantic-core, dotenv, drizzle-orm (+30 more)

### Community 45 - "create.ts"
Cohesion: 0.11
Nodes (32): pathNames(), extractSubgraph(), pathNames(), BOUNDARY_DEFS, CATCH_DEFS, END_DEFS, resolveEnd(), resolveSequenceFlow() (+24 more)

### Community 46 - "P2 — polish"
Cohesion: 0.06
Nodes (33): bpmn-js leftover inventory, Out of scope (this audit), P0-1. Sequence / message flow still start bpmn-js global connect (Visio arrows), P0 — fix first, P1-10. Accessibility: hit targets, dialogs, titles, P1-11. Tone: teal/coral + mixed radius + Inter missing, P1-1. Category flyouts hide unimplemented types until the user searches, P1-2. Two catalogs; flyout search ignores `semanticMeaning` (+25 more)

### Community 47 - "db/package.json"
Cohesion: 0.07
Nodes (26): better-sqlite3, drizzle-kit, @neondatabase/serverless, dependencies, better-sqlite3, dotenv, drizzle-orm, @neondatabase/serverless (+18 more)

### Community 48 - "compilerOptions"
Cohesion: 0.12
Nodes (16): DOM.Iterable, compilerOptions, declaration, declarationMap, esModuleInterop, isolatedModules, lib, module (+8 more)

### Community 49 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, @bpmn/agent-tools, @bpmn/layout-engine, @bpmn/rules, @bpmn/semantic-core, @bpmn/simulate, jspdf, react-dom (+7 more)

### Community 50 - "workflow.ts"
Cohesion: 0.36
Nodes (7): emptyProcess(), idSeqFrom(), FROM_WORKFLOW, processToWorkflow(), workflowToProcess(), workflowType(), detectStructure()

### Community 51 - "semanticGeometry.ts"
Cohesion: 0.18
Nodes (12): BLOCKED_COMMANDS, BLOCKED_EDITOR_ACTIONS, EventBus, geometryOnly(), keepDiLabelBounds(), KeepDiLabelSize(), LabelBox, MoveShape (+4 more)

### Community 52 - "exportDiagram.ts"
Cohesion: 0.26
Nodes (12): applySvgViewBox(), DIAGRAM_EXPORT_PADDING, DiagramBox, isSvgMarkup(), modelBoundsFromViewbox(), padBox(), parseSvgViewBox(), pdfPageSize() (+4 more)

### Community 53 - "ElementInspector.tsx"
Cohesion: 0.17
Nodes (14): ElementInspectorProps, InspectorLintFooter(), LaneNameField(), applyInspectorNameKey(), commitInspectorName(), inspectorNameKeyAction, FieldInput(), GROUP_ORDER (+6 more)

### Community 54 - "execution.ts"
Cohesion: 0.24
Nodes (13): canonical(), catalogCandidates(), CatalogHint, catalogMatch(), engineLabel(), finding(), layerExecution(), RANK (+5 more)

### Community 55 - "simulate/package.json"
Cohesion: 0.12
Nodes (16): dependencies, @bpmn/semantic-core, devDependencies, typescript, vitest, exports, @bpmn/semantic-core, typescript (+8 more)

### Community 56 - "agent-tools/package.json"
Cohesion: 0.11
Nodes (18): dependencies, @bpmn/rules, @bpmn/semantic-core, devDependencies, typescript, vitest, exports, @bpmn/rules (+10 more)

### Community 57 - "createSemanticEditor"
Cohesion: 0.23
Nodes (12): hasNewNodes(), NodeSet, participantSetKey(), shouldApplyFit(), shouldFitCanvas(), createSemanticEditor(), applyOp(), commit() (+4 more)

### Community 58 - "NewProcessDialog.tsx"
Cohesion: 0.29
Nodes (8): ImportBpmnButton, ImportBpmnButtonHandle, ImportBpmnButtonProps, NewProcessDialog(), NewProcessDialogProps, BPMN_FILE_ACCEPT, looksLikeBpmn(), readBpmnFile()

### Community 59 - "api-server/tsconfig.json"
Cohesion: 0.13
Nodes (14): compilerOptions, lib, noEmit, outDir, types, exclude, extends, include (+6 more)

### Community 60 - "applyXmlToViewer.ts"
Cohesion: 0.29
Nodes (10): applyXmlToViewer(), asHoldSvg(), diagramSvgFrom(), HoldClone, holdDiagram(), HoldSvg, IMPORT_HOLD_ATTR, isImportableXml() (+2 more)

### Community 61 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 62 - "processListQuery.ts"
Cohesion: 0.19
Nodes (11): firstString(), parseBoundedInt(), parseProcessListQuery(), PROCESS_LIST_DEFAULT_LIMIT, PROCESS_LIST_KINDS, PROCESS_LIST_MAX_LIMIT, PROCESS_LIST_MAX_PAGE, PROCESS_LIST_SORTS (+3 more)

### Community 63 - "domain/package.json"
Cohesion: 0.12
Nodes (16): dependencies, @bpmn/semantic-core, devDependencies, typescript, vitest, exports, @bpmn/semantic-core, typescript (+8 more)

### Community 64 - "layout-engine/package.json"
Cohesion: 0.12
Nodes (16): dependencies, @bpmn/semantic-core, devDependencies, typescript, vitest, exports, @bpmn/semantic-core, typescript (+8 more)

### Community 65 - "rules/package.json"
Cohesion: 0.11
Nodes (18): dependencies, @bpmn/layout-engine, @bpmn/semantic-core, devDependencies, typescript, vitest, exports, @bpmn/layout-engine (+10 more)

### Community 66 - "semantic-core/package.json"
Cohesion: 0.14
Nodes (13): devDependencies, typescript, vitest, exports, typescript, vitest, name, private (+5 more)

### Community 67 - "services/errors.ts"
Cohesion: 0.47
Nodes (3): ProcessConflictError, ProcessValidationError, ValidationIssue

### Community 68 - "BpmnModdle"
Cohesion: 0.17
Nodes (4): bpmn-moddle, BpmnModdle, moddle-xml, Writer

### Community 69 - "App.tsx"
Cohesion: 0.38
Nodes (6): App(), AppShell(), AppShellProps, readRoute(), writeRoute(), AppRoute

### Community 70 - "Architecture audit — Semantic BPMN north star"
Cohesion: 0.09
Nodes (21): 1. Intent, 2. Semantic Process Graph (IR), 3. Validation (five rule layers), 4. Structured Layout, 5. BPMN DI, 6. Render (bpmn-js as viewer, not source of truth), Agent must not emit XML / DI, Architecture audit — Semantic BPMN north star (+13 more)

### Community 71 - "Architecture — Semantic BPMN 2.0 Builder"
Cohesion: 0.11
Nodes (17): Acceptance, Architecture — Semantic BPMN 2.0 Builder, Build order, Catalog groups (discoverable vocabulary), Compact toolbar = catalog navigation, Context filtering, First creatable slice (`canCreate=true`), Five rule layers (+9 more)

### Community 72 - "CatalogFlyout.tsx"
Cohesion: 0.16
Nodes (19): catalogEnterTarget(), enabledCatalogItems(), flattenCatalogItems(), stepCatalogHighlight(), CatalogFlyout(), CatalogFlyoutProps, CATEGORY_ICON, SUGGESTED (+11 more)

### Community 73 - "tsconfig.json"
Cohesion: 0.17
Nodes (11): api/**/*.ts, middleware.ts, packages/*/src/index.ts, packages/**/*.ts, compilerOptions, baseUrl, paths, extends (+3 more)

### Community 74 - "applyAssistant.ts"
Cohesion: 0.31
Nodes (8): applyAssistantResult(), AssistantApplyResult, AssistantApplySession, AssistantPayload, lastMutatingId(), mutating(), isReadOnlyTool(), ToolCall

### Community 75 - "passwordGate.ts"
Cohesion: 0.31
Nodes (6): config, middleware(), createPasswordGate(), equalSecret(), isAuthorizedBasic(), PasswordEnvironment

### Community 76 - "onboardingStorage.ts"
Cohesion: 0.42
Nodes (6): EditorOnboarding(), EditorOnboardingProps, EDITOR_ONBOARDING_COPY, EDITOR_ONBOARDING_KEY, readEditorOnboardingSeen(), writeEditorOnboardingSeen()

### Community 77 - "diagramElement.ts"
Cohesion: 0.16
Nodes (10): ANCESTORS, DiagramElement, applyPreservedValue(), STRESS, CONTINUE_ACTIONS, ContinueAction, ContinueWithProps, BranchChoice (+2 more)

### Community 78 - "web/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, noEmit, extends, include, src, ../../tsconfig.base.json

### Community 79 - "agent-tools/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, exclude, extends, include, src, src/**/*.test.ts, ../../tsconfig.base.json

### Community 80 - "miwg.roundtrip.test.ts"
Cohesion: 0.36
Nodes (6): CASES, FIXTURES, flowKey(), graphKey(), nodeKey(), semanticGraph()

### Community 81 - "bpmn-adapter/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, exclude, extends, include, src, src/**/*.test.ts, ../../tsconfig.base.json

### Community 82 - "db/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, exclude, extends, include, src, src/**/*.test.ts, ../../tsconfig.base.json

### Community 83 - "domain/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, exclude, extends, include, src, src/**/*.test.ts, ../../tsconfig.base.json

### Community 84 - "layout-engine/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, exclude, extends, include, src, src/**/*.test.ts, ../../tsconfig.base.json

### Community 85 - "rules/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, exclude, extends, include, src, src/**/*.test.ts, ../../tsconfig.base.json

### Community 86 - "semantic-core/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, exclude, extends, include, src, src/**/*.test.ts, ../../tsconfig.base.json

### Community 87 - "simulate/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, exclude, extends, include, src, src/**/*.test.ts, ../../tsconfig.base.json

### Community 88 - "vercel.json"
Cohesion: 0.25
Nodes (7): maxDuration, buildCommand, api/index.ts, functions, outputDirectory, rewrites, $schema

### Community 89 - "api.ts"
Cohesion: 0.18
Nodes (9): AiStatus, api, ApiClient, AssistantResponse, ChatTurn, ProcessListKind, ProcessListParams, ProcessListResponse (+1 more)

### Community 90 - "createTokenView"
Cohesion: 0.60
Nodes (6): createTokenView(), addBadge(), canvas(), clear(), mark(), overlays()

### Community 91 - "ElementInspector.test.ts"
Cohesion: 0.22
Nodes (7): emptyLint, pool, renderInspector(), task, createInspectorCreateGate(), InspectorCreateGate, PoolLaneRow

### Community 93 - "Dead-code audit (conservative)"
Cohesion: 0.20
Nodes (9): Checks, Dead-code audit (conservative), In-flight siblings (do not delete), Left on purpose, Product-language leftovers (used), Removed, TODOs, Unused exports (not deleted) (+1 more)

### Community 104 - "BPMN 2.0 Builder"
Cohesion: 0.20
Nodes (9): API, BPMN 2.0 Builder, Database switch, Dev, Prerequisites, Private Vercel deployment, Scripts, Setup (+1 more)

### Community 105 - "web/package.json"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, preview, type, version

### Community 106 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 107 - "layout.test.ts"
Cohesion: 0.13
Nodes (20): allOrthogonal(), expectDistinctBands(), overlaps(), isOrthogonal(), BASELINE_CY, ORIGIN_X, TOKENS, Bounds (+12 more)

### Community 108 - "placeRegion"
Cohesion: 0.20
Nodes (24): bbox(), branchItems(), containerEvents(), emptyBranch(), fanUnplaced(), fanUnplacedSources(), isContainerRegion(), isEventContainer() (+16 more)

### Community 109 - "Design QA — BPMN palette and Architect mascot"
Cohesion: 0.29
Nodes (6): Design QA — BPMN palette and Architect mascot, Focused comparison and iterations, Full-view review, Functional QA, Normalization, Sources

### Community 110 - "usableXml.ts"
Cohesion: 0.73
Nodes (3): DEFAULT_BPMN_XML, hasStartEvent(), usableXml()

### Community 112 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 114 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 115 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 116 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 117 - "Gaps — honest status"
Cohesion: 0.50
Nodes (3): Done, Gaps — honest status, Still fake / missing

### Community 121 - "semanticAdapter.ts"
Cohesion: 0.37
Nodes (14): arr(), artifactsFromExtras(), asBranch(), asFlow(), asNode(), asRegion(), Dict, fromCoreRegion() (+6 more)

### Community 131 - "typedTaskPaint.ts"
Cohesion: 0.25
Nodes (12): clearMatchingTaskMarkerFills(), GfxNode, Handler, installTypedTaskLabelPad(), isTypedTaskType(), TextPaintOptions, TYPED_TASK_LABEL_PADDING, TYPED_TASK_TYPES (+4 more)

### Community 132 - "graph.ts"
Cohesion: 0.13
Nodes (27): components(), endpoints(), PasteApplied, pasteSubgraph(), SIDE, spliceClip(), tryAfter(), branchTailAfter() (+19 more)

### Community 133 - "route.ts"
Cohesion: 0.46
Nodes (7): associationEdges(), centerY(), colinear(), collapse(), routeOrthogonal(), routeOrthogonalVertical(), snapToGrid()

## Knowledge Gaps
- **655 isolated node(s):** `/Users/a.damashkevich/.local/bin/graphify-mcp`, `app`, `name`, `version`, `private` (+650 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Process` connect `Process` to `layout.ts`, `describeProcess.ts`, `graph.ts`, `preserve.ts`, `bpmnPreview.ts`, `collaboration.ts`, `semantic-xml.ts`, `domain/src/index.ts`, `ops.ts`, `session.ts`, `lintProcess.ts`, `scope.ts`, `semantic-core/src/index.ts`, `bpmn-adapter/src/index.ts`, `BpmnEditor.tsx`, `contextFilter.ts`, `model.ts`, `runAssistant.ts`, `simulate.ts`, `agent-tools/src/index.ts`, `ArchitectPanel.tsx`, `tools.ts`, `create.ts`, `workflow.ts`, `ElementInspector.tsx`, `applyAssistant.ts`, `miwg.roundtrip.test.ts`, `semanticAdapter.ts`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `better-sqlite3` connect `package.json` to `db/src/index.ts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `/Users/a.damashkevich/.local/bin/graphify-mcp`, `app`, `name` to the rest of the system?**
  _655 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `layout.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1106612685560054 - nodes in this community are weakly interconnected._
- **Should `architectPosition.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.056962025316455694 - nodes in this community are weakly interconnected._
- **Should `describeProcess.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.061754385964912284 - nodes in this community are weakly interconnected._
- **Should `inspectorModel.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11806543385490754 - nodes in this community are weakly interconnected._