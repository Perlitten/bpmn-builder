# Graph Report - BPMN 2.0  (2026-08-18)

## Corpus Check
- 335 files · ~156,121 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2505 nodes · 6376 edges · 130 communities (116 shown, 14 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 55 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5411854f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- layout.ts
- architectPosition.ts
- describeProcess.ts
- ElementInspector.tsx
- assistant.ts
- preserve.ts
- Process
- define.ts
- catalogPresentation.ts
- bpmnPreview.ts
- create.ts
- semantic-xml.ts
- domain/src/index.ts
- ops.ts
- getNode
- ProcessListPage.tsx
- lintProcess.ts
- scope.ts
- semantic-core/src/index.ts
- api.ts
- inspectorOps.ts
- useModal
- BpmnComponentRegistry
- bpmn-adapter/src/index.ts
- BpmnEditor.tsx
- contextFilter.ts
- processService.ts
- model.ts
- naming.ts
- runAssistant.ts
- simulate.ts
- DuplicateProcessDialog.tsx
- ProcessRow.tsx
- agent-tools/src/index.ts
- devDependencies
- @bpmn/bpmn-adapter
- bpmn-adapter/package.json
- ArchitectPanel.tsx
- selectMarquee.ts
- package.json
- moddle.ts
- routes/auth.ts
- tools.ts
- db/src/index.ts
- dependencies
- subprocess.ts
- P2 — polish
- db/package.json
- compilerOptions
- dependencies
- AuthGate.tsx
- semanticGeometry.ts
- exportDiagram.ts
- app.ts
- execution.ts
- simulate/package.json
- agent-tools/package.json
- createSemanticEditor
- readBpmnFile.ts
- api-server/tsconfig.json
- applyXmlToViewer.ts
- What You Must Do When Invoked
- processListQuery.ts
- domain/package.json
- layout-engine/package.json
- rules/package.json
- semantic-core/package.json
- api-server/src/index.ts
- BpmnModdle
- App.tsx
- Architecture audit — Semantic BPMN north star
- Architecture — Semantic BPMN 2.0 Builder
- CatalogFlyout.tsx
- tsconfig.json
- applyAssistant.ts
- createTokenSimulation
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
- userFacingPlanError
- createTokenView
- ElementInspector.test.ts
- PressedToggle.tsx
- Dead-code audit (conservative)
- eventLabelCss.test.ts
- BPMN 2.0 Builder
- web/package.json
- graphify reference: extra exports and benchmark
- geometry.ts
- compactChrome.test.ts
- Design QA — BPMN palette and Architect mascot
- usableXml.ts
- bpmn-js
- graphify reference: query, path, explain
- postgres.ts
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- Gaps — honest status
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- graphify
- @bpmn/domain
- lucide-react
- react
- svg2pdf.js
- CLAUDE.md
- .claude/CLAUDE.md
- extraction-spec.md
- typedTaskPaint.ts
- semantic/session.ts

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
- `initializeDatabase()` --calls--> `migrate()`  [EXTRACTED]
  api/index.ts → packages/db/src/migrate.ts
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

## Communities (130 total, 14 thin omitted)

### Community 0 - "layout.ts"
Cohesion: 0.05
Nodes (102): applyLaneBands(), artifactSize(), associationEdges(), bandStack(), bbox(), branchItems(), buildMainChain(), ceilToGrid() (+94 more)

### Community 1 - "architectPosition.ts"
Cohesion: 0.06
Nodes (71): ARCHITECT_COMPANION_HEIGHT, ARCHITECT_COMPANION_WIDTH, ARCHITECT_DRAG_THRESHOLD_PX, ARCHITECT_OPEN_KEY, ARCHITECT_STORAGE_KEY, architectStorage(), ArchitectSurface, between() (+63 more)

### Community 2 - "describeProcess.ts"
Cohesion: 0.07
Nodes (58): ArchitectMascot(), ArchitectMascotProps, ListArchitect(), ListArchitectProps, LIST_ARCHITECT_EDGE, LIST_ARCHITECT_GAP, listArchitectPanelBox, listArchitectPanelStyle() (+50 more)

### Community 3 - "ElementInspector.tsx"
Cohesion: 0.13
Nodes (34): ElementInspector(), ElementInspectorProps, ATTACH_IDS, attachActions(), currentComponentId(), elementName(), eventDefinitionName(), findMatchingReplaceTarget() (+26 more)

### Community 4 - "assistant.ts"
Cohesion: 0.10
Nodes (41): isToolPlanError(), friendlyAiError(), isConfigError(), isUpstreamError(), createGeminiClient(), createNvidiaClient(), NvidiaResponse, NvidiaStreamDelta (+33 more)

### Community 5 - "preserve.ts"
Cohesion: 0.08
Nodes (49): LaneNameField(), applyInspectorNameKey(), commitInspectorName(), inspectorNameKeyAction, FieldInput(), GROUP_ORDER, GROUP_TITLE, PreservedBpmnFields() (+41 more)

### Community 6 - "Process"
Cohesion: 0.07
Nodes (37): withSplit(), twoLaneTasks(), xorXml(), ADD_TASK_LAYOUT, attrCount(), STRESS, stressCounters(), tagCount() (+29 more)

### Community 7 - "define.ts"
Cohesion: 0.07
Nodes (59): BPMN_COMPONENT_CATALOG, ARTIFACTS, DATA, FLOWS, PARTICIPANTS, sequenceLike(), ACTIVITY_SET, ACTIVITY_TYPES (+51 more)

### Community 8 - "catalogPresentation.ts"
Cohesion: 0.15
Nodes (11): CatalogCreateKind, CATEGORY_LABEL, EVENT_GLYPH, eventIcon(), iconClassFor(), PALETTE_CATEGORIES, PaletteCategoryId, TYPE_ICON (+3 more)

### Community 9 - "bpmnPreview.ts"
Cohesion: 0.07
Nodes (41): BpmnSchematic(), BpmnSchematicProps, useLayoutPreview(), attrs(), BpmnPreview, collapseSubprocesses(), collectProcessBodies(), collectTags() (+33 more)

### Community 10 - "create.ts"
Cohesion: 0.15
Nodes (30): addAssociation(), addDataObject(), addDataStore(), addGroup(), addTextAnnotation(), apply(), artifactId(), extras() (+22 more)

### Community 11 - "semantic-xml.ts"
Cohesion: 0.14
Nodes (30): appendExtras(), applyPreserve(), applyXmlns(), decodeValue(), fromPlain(), guessUri(), isArtifactType(), isRef() (+22 more)

### Community 12 - "domain/src/index.ts"
Cohesion: 0.13
Nodes (28): ProcessValidationError, Process, WorkflowDocument, ProcessStatus, ValidationIssue, WorkflowEdge, CORE_WORKFLOW_NODE_TYPES, WorkflowNode (+20 more)

### Community 13 - "ops.ts"
Cohesion: 0.12
Nodes (44): adoptLane(), branchTailAfter(), BranchTarget, branchTargetsAfter(), detachLinear(), dropFromLanes(), findBranch(), flowAfter() (+36 more)

### Community 14 - "getNode"
Cohesion: 0.20
Nodes (16): area(), contains(), cy(), dropSlot, laneForDrop(), lastNodeLeftOf(), pickBranch(), reorderSlot() (+8 more)

### Community 15 - "ProcessListPage.tsx"
Cohesion: 0.12
Nodes (32): AuthProvider(), ListKindTabs(), ListKindTabsProps, ListPaginationFooter(), ListPaginationFooterProps, lastListPage(), LIST_PANEL_ID, LIST_SORTS (+24 more)

### Community 16 - "lintProcess.ts"
Cohesion: 0.13
Nodes (28): InspectorLintFooter(), chipTone(), ScoreChips(), ScoreChipsProps, executionScore(), allFindings(), clamp(), formatScores() (+20 more)

### Community 17 - "scope.ts"
Cohesion: 0.12
Nodes (38): locate(), resolveAgentContext(), applyScopeDefaults(), assertLocksIntact(), assertMutationAllowed(), assertOutsideScopeIntact(), branchById(), branchHas() (+30 more)

### Community 18 - "semantic-core/src/index.ts"
Cohesion: 0.09
Nodes (51): applyInPool(), asGraph(), mergePool(), poolTargetOf(), poolView(), seedPool(), canReach(), compatibleJoin() (+43 more)

### Community 19 - "api.ts"
Cohesion: 0.12
Nodes (23): BpmnEditorHandle, AiStatus, api, ApiClient, ApiError, AssistantResponse, ChatTurn, fetchProcess() (+15 more)

### Community 20 - "inspectorOps.ts"
Cohesion: 0.14
Nodes (23): applyFlowKind(), applyViewerLabel(), attachBoundary(), BpmnFactory, BpmnReplace, canDeleteElement(), canReplaceWithBpmnJs(), deleteSelection() (+15 more)

### Community 21 - "useModal"
Cohesion: 0.10
Nodes (28): RenameProcessDialog(), RenameProcessDialogProps, EditorChromeProps, Button(), ButtonProps, sizes, variants, ChromeMenu() (+20 more)

### Community 22 - "BpmnComponentRegistry"
Cohesion: 0.20
Nodes (7): changeToOptions(), ReplaceTargetShape, BPMN_JS_TARGETS, bpmnJsReplacePayload(), BpmnComponentRegistry, get(), BpmnComponentDefinition

### Community 23 - "bpmn-adapter/src/index.ts"
Cohesion: 0.14
Nodes (27): archiveMessage(), BPMN_20_MODEL_NS, BPMN_20_NS, BpmnImportCode, BpmnImportError, BpmnSniffResult, bpmnXmlShapeError(), CONVENTIONAL (+19 more)

### Community 24 - "BpmnEditor.tsx"
Cohesion: 0.09
Nodes (42): BpmnCanvas, BpmnEditor, BpmnEditorProps, CanvasService, Dragging, EventBus, fitRemaining(), HandTool (+34 more)

### Community 25 - "contextFilter.ts"
Cohesion: 0.26
Nodes (13): isBpmnType(), catalogGroup(), createKind(), contextReason(), FilterContext, isActivity(), isPoolOrLane(), isSequenceFlowSource() (+5 more)

### Community 26 - "processService.ts"
Cohesion: 0.20
Nodes (25): ownerId(), registerProcessRoutes(), ProcessConflictError, sendProcessError(), assertPatch(), assertPersisted(), createProcess(), createTemplateFromProcess() (+17 more)

### Community 27 - "model.ts"
Cohesion: 0.13
Nodes (28): catalogCandidates(), attrs(), Bounds, bpmnTypeFromTag(), cancelActivityFrom(), collect(), CORE_TYPE, decode() (+20 more)

### Community 28 - "naming.ts"
Cohesion: 0.15
Nodes (29): isExclusiveXor(), layerStyle(), ACTION_VERBS, asEndState(), asQuestion(), asStartState(), asTask(), capitalize() (+21 more)

### Community 29 - "runAssistant.ts"
Cohesion: 0.17
Nodes (21): AGENT_SKIP_CREATE, COLLAB_COMPONENT_IDS, COLLAB_TOOLS, collaborationRequested(), constrainToolPlan(), creatableConstructions(), createComponentIds(), isCollabTool() (+13 more)

### Community 30 - "simulate.ts"
Cohesion: 0.18
Nodes (22): Canvas, Modeler, Overlays, TokenView, isEventSubProcess(), choiceKind(), completedCount(), describeSimulation() (+14 more)

### Community 31 - "DuplicateProcessDialog.tsx"
Cohesion: 0.38
Nodes (6): DuplicateProcessDialog(), DuplicateProcessDialogProps, DuplicateDialogDecision, duplicateRequestFromDialog(), copyProcessName(), ProcessSummary

### Community 32 - "ProcessRow.tsx"
Cohesion: 0.13
Nodes (21): counted(), listQualitySignal, signal(), lint(), analyzeRow(), ProcessRow, ProcessRowProps, RowAnalysis (+13 more)

### Community 33 - "agent-tools/src/index.ts"
Cohesion: 0.19
Nodes (21): branchView(), flowView(), inspectBranchView(), inspectRegionView(), nodeView(), processView(), regionView(), AGENT_SCOPE_KINDS (+13 more)

### Community 34 - "devDependencies"
Cohesion: 0.13
Nodes (15): devDependencies, tailwindcss, @tailwindcss/vite, @types/react, @types/react-dom, typescript, vite, @vitejs/plugin-react (+7 more)

### Community 36 - "bpmn-adapter/package.json"
Cohesion: 0.09
Nodes (21): bpmn-moddle, moddle-xml, dependencies, @bpmn/domain, @bpmn/layout-engine, bpmn-moddle, @bpmn/semantic-core, moddle-xml (+13 more)

### Community 37 - "ArchitectPanel.tsx"
Cohesion: 0.17
Nodes (20): AGENT_SCOPE_OPTIONS, AgentContext, buildAssistantScope(), scopeOptionEnabled(), ArchitectComposeKey, isArchitectComposeSubmitKey(), isImeComposing(), enter (+12 more)

### Community 38 - "selectMarquee.ts"
Cohesion: 0.16
Nodes (14): createSelectMarqueeModule(), DiagramNode, EditorTool, EventBus, HandTool, isMarqueeSurface(), LassoTool, MouseDownEvent (+6 more)

### Community 39 - "package.json"
Cohesion: 0.06
Nodes (33): dependencies, @bpmn/db, express, @vercel/functions, devDependencies, @types/express, @types/node, typescript (+25 more)

### Community 40 - "moddle.ts"
Cohesion: 0.15
Nodes (30): reload(), ARTIFACT_TYPES, idOf(), isType(), Prop, readMany(), refId(), refOf() (+22 more)

### Community 41 - "routes/auth.ts"
Cohesion: 0.10
Nodes (40): clearOAuthStateCookie(), clearOptions(), clearSessionCookie(), cookieOptions(), setOAuthStateCookie(), setSessionCookie(), AUTH_SETUP_HINT, GoogleAuthConfig (+32 more)

### Community 42 - "tools.ts"
Cohesion: 0.12
Nodes (20): ToolPlanError, xorProcess(), addAfter(), addBefore(), addTask(), ARG_ALIASES, branchesArg(), componentDef() (+12 more)

### Community 43 - "db/src/index.ts"
Cohesion: 0.14
Nodes (19): AppDb, createDb(), getDb(), getDbDriver(), getUsersTable(), resetDbForTests(), getDbProvider(), isMemorySqlite() (+11 more)

### Community 44 - "dependencies"
Cohesion: 0.05
Nodes (38): dependencies, @bpmn/agent-tools, @bpmn/bpmn-adapter, @bpmn/db, @bpmn/domain, @bpmn/semantic-core, dotenv, drizzle-orm (+30 more)

### Community 45 - "subprocess.ts"
Cohesion: 0.39
Nodes (11): makeNode(), rootScope(), scopeOf(), addSubProcess(), apply(), collectRegion(), createEventSubprocess(), expandFragment() (+3 more)

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

### Community 50 - "AuthGate.tsx"
Cohesion: 0.17
Nodes (14): AuthContext, AuthContextValue, AuthGate(), useAuth(), UserMenu(), AuthStatus, fetchAuthStatus(), fetchSessionUser() (+6 more)

### Community 51 - "semanticGeometry.ts"
Cohesion: 0.18
Nodes (12): BLOCKED_COMMANDS, BLOCKED_EDITOR_ACTIONS, EventBus, geometryOnly(), keepDiLabelBounds(), KeepDiLabelSize(), LabelBox, MoveShape (+4 more)

### Community 52 - "exportDiagram.ts"
Cohesion: 0.26
Nodes (12): applySvgViewBox(), DIAGRAM_EXPORT_PADDING, DiagramBox, isSvgMarkup(), modelBoundsFromViewbox(), padBox(), parseSvgViewBox(), pdfPageSize() (+4 more)

### Community 53 - "app.ts"
Cohesion: 0.19
Nodes (12): createApp(), repoRoot, attachCookies(), parseCookieHeader(), attachSession(), isPublicApiPath(), requireAuth(), registerHealthRoutes() (+4 more)

### Community 54 - "execution.ts"
Cohesion: 0.24
Nodes (12): canonical(), CatalogHint, catalogMatch(), engineLabel(), finding(), layerExecution(), RANK, sameEngineSupport() (+4 more)

### Community 55 - "simulate/package.json"
Cohesion: 0.12
Nodes (16): dependencies, @bpmn/semantic-core, devDependencies, typescript, vitest, exports, @bpmn/semantic-core, typescript (+8 more)

### Community 56 - "agent-tools/package.json"
Cohesion: 0.11
Nodes (18): dependencies, @bpmn/rules, @bpmn/semantic-core, devDependencies, typescript, vitest, exports, @bpmn/rules (+10 more)

### Community 57 - "createSemanticEditor"
Cohesion: 0.23
Nodes (12): hasNewNodes(), NodeSet, participantSetKey(), shouldApplyFit(), shouldFitCanvas(), createSemanticEditor(), applyOp(), commit() (+4 more)

### Community 58 - "readBpmnFile.ts"
Cohesion: 0.38
Nodes (6): ImportBpmnButton, ImportBpmnButtonHandle, ImportBpmnButtonProps, BPMN_FILE_ACCEPT, looksLikeBpmn(), readBpmnFile()

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

### Community 67 - "api-server/src/index.ts"
Cohesion: 0.23
Nodes (11): app, initializeDatabase(), DEFAULT_BPMN_XML, __dirname, PORT, repoRoot, startServer(), webRoot (+3 more)

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
Cohesion: 0.21
Nodes (12): applyAssistantResult(), AssistantApplyResult, AssistantApplySession, AssistantPayload, lastMutatingId(), mutating(), named(), NODE (+4 more)

### Community 75 - "createTokenSimulation"
Cohesion: 0.38
Nodes (10): createTokenSimulation(), arrive(), bump(), consumeHostInstance(), drain(), emitAll(), emitFlow(), fireBoundary() (+2 more)

### Community 76 - "onboardingStorage.ts"
Cohesion: 0.42
Nodes (6): EditorOnboarding(), EditorOnboardingProps, EDITOR_ONBOARDING_COPY, EDITOR_ONBOARDING_KEY, readEditorOnboardingSeen(), writeEditorOnboardingSeen()

### Community 77 - "diagramElement.ts"
Cohesion: 0.16
Nodes (12): ANCESTORS, DiagramElement, CONTINUE_ACTIONS, ContinueAction, ContinueWithProps, BranchChoice, continueTarget(), InsertTarget (+4 more)

### Community 78 - "web/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, noEmit, extends, include, src, ../../tsconfig.base.json

### Community 79 - "agent-tools/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, exclude, extends, include, src, src/**/*.test.ts, ../../tsconfig.base.json

### Community 80 - "miwg.roundtrip.test.ts"
Cohesion: 0.24
Nodes (9): CASES, FIXTURES, flowKey(), graphKey(), nodeKey(), semanticGraph(), createModdle(), parseDefinitions() (+1 more)

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

### Community 89 - "userFacingPlanError"
Cohesion: 0.36
Nodes (4): editorNoticeText(), NOTICE_DISMISS_MS, visibleEditorChrome(), userFacingPlanError()

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
Cohesion: 0.18
Nodes (10): API, Auth (Google only), BPMN 2.0 Builder, Database switch, Dev, Prerequisites, Private Vercel deployment, Scripts (+2 more)

### Community 105 - "web/package.json"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, preview, type, version

### Community 106 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 107 - "geometry.ts"
Cohesion: 0.60
Nodes (4): assertNoGeometry(), GEOMETRY_KEYS, looksLikeBpmnXml(), walk()

### Community 108 - "compactChrome.test.ts"
Cohesion: 0.50
Nodes (3): chromeProps, dir, EditorChrome()

### Community 109 - "Design QA — BPMN palette and Architect mascot"
Cohesion: 0.29
Nodes (6): Design QA — BPMN palette and Architect mascot, Focused comparison and iterations, Full-view review, Functional QA, Normalization, Sources

### Community 110 - "usableXml.ts"
Cohesion: 0.73
Nodes (3): DEFAULT_BPMN_XML, hasStartEvent(), usableXml()

### Community 112 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 113 - "postgres.ts"
Cohesion: 0.50
Nodes (3): processes, sessions, users

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

### Community 131 - "typedTaskPaint.ts"
Cohesion: 0.25
Nodes (12): clearMatchingTaskMarkerFills(), GfxNode, Handler, installTypedTaskLabelPad(), isTypedTaskType(), TextPaintOptions, TYPED_TASK_LABEL_PADDING, TYPED_TASK_TYPES (+4 more)

### Community 132 - "semantic/session.ts"
Cohesion: 0.13
Nodes (20): assignCreatedToLane(), createdLaneTargets(), createIntoLane(), DiagramWriter, ImportXmlOptions, MODELER_REMOUNT_KEYS, SemanticEditor, components() (+12 more)

## Knowledge Gaps
- **668 isolated node(s):** `/Users/a.damashkevich/.local/bin/graphify-mcp`, `app`, `name`, `version`, `private` (+663 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Process` connect `Process` to `layout.ts`, `describeProcess.ts`, `ElementInspector.tsx`, `semantic/session.ts`, `preserve.ts`, `bpmnPreview.ts`, `create.ts`, `semantic-xml.ts`, `domain/src/index.ts`, `ops.ts`, `getNode`, `lintProcess.ts`, `scope.ts`, `semantic-core/src/index.ts`, `bpmn-adapter/src/index.ts`, `model.ts`, `runAssistant.ts`, `simulate.ts`, `agent-tools/src/index.ts`, `ArchitectPanel.tsx`, `tools.ts`, `subprocess.ts`, `applyAssistant.ts`, `diagramElement.ts`, `miwg.roundtrip.test.ts`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `better-sqlite3` connect `package.json` to `db/src/index.ts`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `/Users/a.damashkevich/.local/bin/graphify-mcp`, `app`, `name` to the rest of the system?**
  _668 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `layout.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05399792315680166 - nodes in this community are weakly interconnected._
- **Should `architectPosition.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.056962025316455694 - nodes in this community are weakly interconnected._
- **Should `describeProcess.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06729264475743349 - nodes in this community are weakly interconnected._
- **Should `ElementInspector.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12944523470839261 - nodes in this community are weakly interconnected._