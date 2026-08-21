# Component Map

## ShowcaseDemo
- Kind: Composition
- Variants: default
- States: default
- Props:
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/showcase/ShowcaseDemo.tsx:1`

## ShowcaseViewer
- Kind: Composition
- Variants: default
- States: default
- Props: xml
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/showcase/ShowcaseViewer.tsx:1`

## NewProcessDialog
- Kind: Composition
- Variants: default
- States: default, disabled
- Props: open, busy, error, onClose, onDescribe, onBlank, onImport, onRetryImport
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/process-list/NewProcessDialog.tsx:1`

## TemplatesSection
- Kind: Composition
- Variants: default
- States: default, disabled
- Props: templates, busy, onUse, onOpen
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/process-list/TemplatesSection.tsx:1`

## BpmnSchematic
- Kind: Composition
- Variants: default
- States: default
- Props: xml, preview
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/process-list/BpmnSchematic.tsx:1`

## ListKindTabs
- Kind: Composition
- Variants: default
- States: default
- Props: kind, onChange
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/process-list/ListKindTabs.tsx:1`

## ListPaginationFooter
- Kind: Composition
- Variants: default
- States: default, disabled
- Props: from, to, total, page, pageSize, onPrev, onNext
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/process-list/ListPaginationFooter.tsx:1`

## ProcessRow
- Kind: Composition
- Variants: default
- States: default
- Props: process, onOpen, onRename, onDuplicate, onDelete
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/process-list/ProcessRow.tsx:1`

## ImportBpmnButton
- Kind: Composition
- Variants: default
- States: default, disabled
- Props: disabled, label, variant, onImport, onError
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/process-list/ImportBpmnButton.tsx:1`

## RenameProcessDialog
- Kind: Composition
- Variants: default
- States: default, disabled
- Props: process, busy, error, onRename, onClose
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/process-list/RenameProcessDialog.tsx:1`

## DuplicateProcessDialog
- Kind: Composition
- Variants: default
- States: default, disabled
- Props: process, busy, error, onConfirm, onClose
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/process-list/DuplicateProcessDialog.tsx:1`

## BpmnZoomControls
- Kind: Composition
- Variants: default
- States: default
- Props: scale, onZoomIn, onZoomOut, onFit, onReset
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/bpmn-editor/BpmnZoomControls.tsx:1`

## ContinueWith
- Kind: Composition
- Variants: default
- States: default, disabled
- Props: source, hasParticipant, anchor
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/bpmn-editor/palette/ContinueWith.tsx:1`

## glyphs
- Kind: Composition
- Variants: default
- States: default
- Props:
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/bpmn-editor/palette/glyphs.tsx:1`

## CatalogFlyout
- Kind: Composition
- Variants: default
- States: default, disabled
- Props: view, query, selection, hasParticipant, onQueryChange, onViewChange, onPick, onClose
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/bpmn-editor/palette/CatalogFlyout.tsx:1`

## PaletteRail
- Kind: Composition
- Variants: default
- States: default, disabled
- Props: tool, catalogView, query, selection, hasParticipant, onTool, onOpenCatalog, onQueryChange, onPick, onCloseCatalog
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/bpmn-editor/palette/PaletteRail.tsx:1`

## BpmnEditor
- Kind: Composition
- Variants: default
- States: default, disabled
- Props: processId, xml, simulating, onChange, onSimStatus
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/bpmn-editor/BpmnEditor.tsx:1`

## EditorOnboarding
- Kind: Composition
- Variants: default
- States: default
- Props: onDismiss
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/bpmn-editor/EditorOnboarding.tsx:1`

## BpmnCanvas
- Kind: Composition
- Variants: default
- States: default
- Props:
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/bpmn-editor/BpmnCanvas.tsx:1`

## ElementInspector
- Kind: Composition
- Variants: default
- States: default, disabled
- Props: element, canDelete, lint, framed, replaceWorks, onRename, onRenameLane, onChangeTo, onDelete, onFlowKind, onCondition, onDefaultOutgoing, onCalledElement, onAttach, onCreate, process, onPreservedChange, poolLanes, nodeLanes, currentLaneId, onAssignLane
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/bpmn-editor/inspector/ElementInspector.tsx:1`

## PreservedBpmnFields
- Kind: Composition
- Variants: default
- States: default
- Props: process, element, onChange
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/bpmn-editor/inspector/PreservedBpmnFields.tsx:1`

## ListArchitect
- Kind: Composition
- Variants: default
- States: default, disabled
- Props: busy, error, onDescribe
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/bpmn-editor/architect/ListArchitect.tsx:1`

## ArchitectPanel
- Kind: Composition
- Variants: default
- States: default, disabled
- Props: disabled, configured, context, onProtectBranch, onApply, message, history, scope, signal, ) => Promise<AssistantApplyResult>;
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/bpmn-editor/architect/ArchitectPanel.tsx:1`

## ArchitectShell
- Kind: Composition
- Variants: default
- States: default, disabled
- Props: surface, persistOpen, busy, error, success, children
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/bpmn-editor/architect/ArchitectShell.tsx:1`

## ArchitectMascot
- Kind: Composition
- Variants: default
- States: default
- Props: mood, collapsed
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/bpmn-editor/architect/ArchitectMascot.tsx:1`

## ScoreChips
- Kind: Composition
- Variants: default
- States: default
- Props: lint
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/lint/ScoreChips.tsx:1`

## Skeleton
- Kind: Primitive
- Variants: default
- States: default
- Props:
- Notes: Reusable UI component.
- Call Sites:
  - `apps/web/src/components/ui/Skeleton.tsx:1`

## Button
- Kind: Primitive
- Variants: default
- States: default
- Props: variant, size
- Notes: Reusable UI component.
- Call Sites:
  - `apps/web/src/components/ui/Button.tsx:1`

## ChromeMenu
- Kind: Primitive
- Variants: default
- States: default, disabled
- Props: label, ariaLabel, disabled, align, children
- Notes: Reusable UI component.
- Call Sites:
  - `apps/web/src/components/ui/ChromeMenu.tsx:1`

## TextField
- Kind: Primitive
- Variants: default
- States: default
- Props: variant
- Notes: Reusable UI component.
- Call Sites:
  - `apps/web/src/components/ui/TextField.tsx:1`

## ConfirmDialog
- Kind: Primitive
- Variants: default
- States: default, disabled
- Props: open, title, body, confirmLabel, role, busy, onConfirm, onCancel
- Notes: Reusable UI component.
- Call Sites:
  - `apps/web/src/components/ui/ConfirmDialog.tsx:1`

## PressedToggle
- Kind: Primitive
- Variants: default
- States: default
- Props: pressed, children
- Notes: Reusable UI component.
- Call Sites:
  - `apps/web/src/components/ui/PressedToggle.tsx:1`

## SaveStatus
- Kind: Primitive
- Variants: default
- States: default
- Props: saving, savedAt
- Notes: Reusable UI component.
- Call Sites:
  - `apps/web/src/components/ui/SaveStatus.tsx:1`

## EditorChrome
- Kind: Composition
- Variants: default
- States: default, disabled
- Props: name, saving, savedAt, busy, notice, simulating, simStatus, compact, onBack, onNameChange, onNameCommit, onExport, onExportSvg, onExportPdf, onSaveTemplate, onClear, onToggleSimulate, onResetSimulation, account
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/shell/EditorChrome.tsx:1`

## UserMenu
- Kind: Composition
- Variants: default
- States: default
- Props:
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/shell/UserMenu.tsx:1`

## AppShell
- Kind: Composition
- Variants: default
- States: default
- Props: route, onNavigate, children
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/shell/AppShell.tsx:1`

## AuthGate
- Kind: Composition
- Variants: default
- States: default, loading
- Props:
- Notes: Page-specific composition.
- Call Sites:
  - `apps/web/src/components/auth/AuthGate.tsx:1`
