import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { AgentScope } from '@bpmn/agent-tools';
import { replaceBpmnType, type BpmnComponentDefinition } from '@bpmn/semantic-core';
import {
  createTokenSimulation,
  describeSimulation,
  describeSimulationError,
  resolveClick,
  simulationMarks,
  type TokenSimulation,
} from '@bpmn/simulate';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import { BpmnCanvas, type AccessibleDiagramItem } from './BpmnCanvas';
import { BpmnZoomControls } from './BpmnZoomControls';
import { BpmnMinimap, LARGE_DIAGRAM_SHAPES, type DiagramViewport } from './BpmnMinimap';
import { DEFAULT_BPMN_XML } from './defaultBpmnXml';
import { ArchitectPanel } from './architect/ArchitectPanel';
import { applyAssistantResult } from './architect/applyAssistant';
import { resolveAgentContext } from './architect/agentScope';
import { ElementInspector, InspectorLintFooter } from './inspector/ElementInspector';
import { ValidationPanel } from './inspector/ValidationPanel';
import { commitPreservedChange } from './inspector/preservedFields';
import { fetchAiStatus, runAssistant, type ChatTurn } from '../../lib/api';
import { modelBoundsFromViewbox, prepareDiagramSvg } from '../../lib/exportDiagram';
import { attachBoundary, applyViewerLabel, canDeleteElement, canReplaceWithBpmnJs, deleteSelection, replaceElement } from './inspector/inspectorOps';
import { lanesInPool, flowNodeLaneAssignment, type FlowKind } from './inspector/inspectorModel';
import { isEditorChromeKeyTarget, selectableElement, selectionIdsEqual } from './inspector/selectable';
import { pickCatalogItem } from './palette/createFromCatalog';
import { semanticGeometryModule } from './palette/semanticGeometry';
import { typedTaskPaintModule } from './typedTaskPaint';
import { ContinueWith } from './palette/ContinueWith';
import { gfxAnchor } from './palette/modelerServices';
import { continueTarget, isSequenceFlowElement, resolveInsert, type InsertTarget } from './palette/insertTarget';
import { editorNoticeText, visibleEditorChrome } from './editorNotice';
import { useLiveBpmnXml } from './useLiveBpmnXml';
import { lintLiveBpmnXml } from './liveBpmnLint';
import { PaletteRail } from './palette/PaletteRail';
import { isSequenceFlowSource } from './palette/contextFilter';
import type { PaletteCatalogView } from './palette/catalogPresentation';
import type { ResolvedCatalogItem } from './palette/contextFilter';
import type { DiagramElement } from './diagramElement';
import { createSemanticEditor, type SemanticEditor } from './semantic/session';
import { simulationLock, simulationLockModule } from './simulate/simulationLock';
import { createTokenView, type TokenView } from './simulate/tokenView';
import { isCompactViewport, useCompactViewport } from './compactViewport';
import { EditorOnboarding } from './EditorOnboarding';
import { readEditorOnboardingSeen } from './onboardingStorage';
import { shouldApplyFit } from './fitCanvas';
import { applyFit, COMPACT_FIT_PADDING, DESKTOP_FIT_PADDING, panCanvasToShape } from './fitViewport';
import {
  applySpacePanDown,
  applySpacePanUp,
  bindKeyboardToHost,
  canvasNavigationTarget,
  createSpacePanHold,
  isCanvasNavigationKey,
  isCopyKey,
  isPasteKey,
  isRedoKey,
  isUndoKey,
  releaseSpacePan,
  silenceCanvasTabStop,
  type EditorKeyboard,
} from './hostKeyboard';
import { createSelectMarqueeModule } from './selectMarquee';
import { applyXmlToViewer } from './applyXmlToViewer';
import { usableXml } from './usableXml';
import { ModeBar, Toast } from '../ui';
import { InspectorShell } from './InspectorShell';
import { presentedFindings } from '../lint/lintPresentation';

type BpmnEditorProps = {
  processId: string;
  xml: string;
  simulating?: boolean;
  onExitSimulation?: () => void;
  onChange?: (xml: string) => void;
  onSimStatus?: (status: string) => void;
};

export type BpmnEditorHandle = {
  getXml: () => Promise<string | undefined>;
  getDiagramSvg: () => Promise<string | undefined>;
  resetToStarter: () => Promise<void>;
  resetSimulation: () => void;
};

type Viewbox = { x: number; y: number; width: number; height: number; scale?: number };

type CanvasService = {
  zoom: (scale?: string | number, center?: string) => number;
  resized: () => void;
  getRootElement: () => DiagramElement;
  viewbox: (next?: Viewbox) => Viewbox & {
    inner?: { x: number; y: number; width: number; height: number };
    outer?: { width: number; height: number };
  };
  addMarker?: (id: string, marker: string) => void;
  removeMarker?: (id: string, marker: string) => void;
};

type ZoomScrollService = { stepZoom: (delta: number) => void };

type HandTool = {
  toggle: () => void;
  isActive: () => boolean;
};

type Dragging = { cancel: () => void };

type SelectionService = {
  get: () => DiagramElement[];
  select: (el: unknown) => void;
};

type ElementRegistry = {
  filter: (fn: (el: DiagramElement) => boolean) => DiagramElement[];
  get: (id: string) => DiagramElement | undefined;
};

type EventBus = {
  on: (event: string | string[], cb: (payload?: unknown) => void) => void;
  off: (event: string | string[], cb: (payload?: unknown) => void) => void;
};

function readableBpmnType(type: string): string {
  return type
    .replace(/^bpmn:/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
}

function navigableElements(registry: ElementRegistry): DiagramElement[] {
  const seen = new Set<string>();
  return registry
    .filter((candidate) => {
      const element = selectableElement(candidate);
      return !!element
        && !element.source
        && !element.target
        && typeof element.width === 'number'
        && typeof element.height === 'number';
    })
    .map((candidate) => selectableElement(candidate))
    .filter((candidate): candidate is DiagramElement => {
      if (!candidate || seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return true;
    })
    .sort((a, b) => (a.x ?? Number.MAX_SAFE_INTEGER) - (b.x ?? Number.MAX_SAFE_INTEGER)
      || (a.y ?? Number.MAX_SAFE_INTEGER) - (b.y ?? Number.MAX_SAFE_INTEGER)
      || a.id.localeCompare(b.id));
}

function accessibleItems(elements: DiagramElement[]): AccessibleDiagramItem[] {
  return elements.map((element) => ({
    id: element.id,
    name: element.businessObject?.name?.trim() || readableBpmnType(element.type) || element.id,
    type: readableBpmnType(element.type),
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  }));
}

function sameAccessibleItems(left: AccessibleDiagramItem[], right: AccessibleDiagramItem[]): boolean {
  return left.length === right.length && left.every((item, index) => {
    const next = right[index];
    return next?.id === item.id
      && next.name === item.name
      && next.type === item.type
      && next.x === item.x
      && next.y === item.y
      && next.width === item.width
      && next.height === item.height;
  });
}

function readViewbox(canvas: CanvasService): Viewbox | undefined {
  try {
    if (!canvas.getRootElement()) return undefined;
    return canvas.viewbox();
  } catch {
    return undefined;
  }
}

function tryResized(canvas: CanvasService) {
  try {
    canvas.resized();
  } catch {
    /* bpmn-js throws root-0 when import left the canvas without a diagram */
  }
}

function fitRemaining(canvas: CanvasService, host: HTMLElement | null) {
  return applyFit(
    canvas,
    isCompactViewport(window.innerWidth) ? COMPACT_FIT_PADDING : DESKTOP_FIT_PADDING,
    host,
  );
}

type MovedShape = { id: string; x?: number; y?: number; width?: number; height?: number };

function movedShape(payload: unknown): MovedShape | undefined {
  const ctx = (payload as { context?: { shape?: MovedShape; shapes?: MovedShape[] } } | undefined)?.context;
  if (ctx?.shape?.id) return ctx.shape;
  if (ctx?.shapes?.length === 1 && ctx.shapes[0]?.id) return ctx.shapes[0];
  return undefined;
}

export const BpmnEditor = forwardRef<BpmnEditorHandle, BpmnEditorProps>(function BpmnEditor(
  { processId, xml, simulating = false, onExitSimulation, onChange, onSimStatus },
  ref,
) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasKeyboardRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | null>(null);
  const sessionRef = useRef<SemanticEditor | null>(null);
  const simRef = useRef<TokenSimulation | null>(null);
  const tokenViewRef = useRef<TokenView | null>(null);
  const simChoiceIdsRef = useRef<string[]>([]);
  const simChoiceIndexRef = useRef(0);
  const simulatingRef = useRef(simulating);
  const onExitSimulationRef = useRef(onExitSimulation);
  const onSimStatusRef = useRef(onSimStatus);
  const { xmlRef, currentXml, revision: graphRev, emit } = useLiveBpmnXml(processId, xml, onChange);
  const [scale, setScale] = useState(1);
  const [viewport, setViewport] = useState<DiagramViewport>();
  const [tool, setTool] = useState<'select' | 'pan'>('select');
  const toolRef = useRef(tool);
  const spacePanHoldRef = useRef(createSpacePanHold());
  const [catalogView, setCatalogView] = useState<PaletteCatalogView | null>(null);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<DiagramElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const labelWriteRef = useRef(false);
  const [lockRev, setLockRev] = useState(0);
  const [canDelete, setCanDelete] = useState(false);
  const [hasParticipant, setHasParticipant] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [lintXml, setLintXml] = useState(currentXml);
  const [onboarding, setOnboarding] = useState(() => !readEditorOnboardingSeen());
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [canvasAnnouncement, setCanvasAnnouncement] = useState('');
  const [canvasItems, setCanvasItems] = useState<AccessibleDiagramItem[]>([]);
  const [toast, setToast] = useState<{ message: string; action: 'redo' | 'undo' } | null>(null);
  const [validating, setValidating] = useState(false);
  const lintMarkerIdsRef = useRef(new Set<string>());
  const compact = useCompactViewport();

  onSimStatusRef.current = onSimStatus;
  simulatingRef.current = simulating;
  onExitSimulationRef.current = onExitSimulation;
  toolRef.current = tool;

  useEffect(() => {
    const ac = new AbortController();
    void fetchAiStatus(ac.signal)
      .then((info) => {
        if (!ac.signal.aborted) setAiConfigured(info.configured);
      })
      .catch(() => {
        if (!ac.signal.aborted) setAiConfigured(null);
      });
    return () => ac.abort();
  }, []);

  const publishSim = useCallback(() => {
    const session = sessionRef.current;
    const sim = simRef.current;
    if (!session || !sim) {
      onSimStatusRef.current?.('');
      return;
    }
    const process = session.process();
    const snap = sim.snapshot();
    const marks = simulationMarks(process, snap);
    simChoiceIdsRef.current = marks.choice;
    if (simChoiceIndexRef.current >= marks.choice.length) simChoiceIndexRef.current = 0;
    tokenViewRef.current?.sync(process, snap);
    onSimStatusRef.current?.(describeSimulation(process, snap));
    setHint(describeSimulation(process, snap));
  }, []);

  const refreshSelection = useCallback(() => {
    const modeler = modelerRef.current;
    const host = overlayRef.current;
    if (!modeler) return;
    const selected = (modeler.get('selection') as SelectionService).get();
    const active = document.activeElement;
    if (active && active !== canvasKeyboardRef.current && canvasRef.current?.contains(active)) {
      canvasKeyboardRef.current?.focus({ preventScroll: true });
    }
    const ids = selected.map(selectableElement).map((el) => el?.id).filter((id): id is string => !!id);
    const next = selected.map(selectableElement).find((el): el is DiagramElement => !!el) ?? null;
    if (labelWriteRef.current) {
      if (!next) return;
      setSelectedIds((prev) => (selectionIdsEqual(prev, ids) ? prev : ids));
      setSelection((prev) => (prev?.id === next.id ? prev : next));
      return;
    }
    setSelectedIds(ids);
    setSelection(next);
    setCanDelete(next ? canDeleteElement(modeler, next) : false);
    const registry = modeler.get('elementRegistry') as ElementRegistry;
    setHasParticipant(registry.filter((el) => el.type === 'bpmn:Participant').length > 0);
    const items = accessibleItems(navigableElements(registry));
    setCanvasItems((current) => (sameAccessibleItems(current, items) ? current : items));
    if (next && (isSequenceFlowSource(next) || isSequenceFlowElement(next)) && host) {
      setAnchor(gfxAnchor(modeler, next, host));
    } else {
      setAnchor(null);
    }
  }, []);

  const applyUndo = useCallback(async () => {
    const session = sessionRef.current;
    if (!session?.canUndo() || simulatingRef.current) return;
    emit(await session.undo());
    setToast({ message: 'Undid last change', action: 'redo' });
  }, [emit]);

  const applyRedo = useCallback(async () => {
    const session = sessionRef.current;
    if (!session?.canRedo() || simulatingRef.current) return;
    emit(await session.redo());
    setToast({ message: 'Redid last change', action: 'undo' });
  }, [emit]);

  useImperativeHandle(ref, () => ({
    getXml: async () => sessionRef.current?.xml(),
    getDiagramSvg: async () => {
      const modeler = modelerRef.current;
      if (!modeler) return undefined;
      const { svg } = await modeler.saveSVG();
      const canvas = modeler.get('canvas') as CanvasService;
      return prepareDiagramSvg(svg, modelBoundsFromViewbox(canvas.viewbox()));
    },
    resetToStarter: async () => {
      const xml = await sessionRef.current?.adoptXml(DEFAULT_BPMN_XML);
      if (xml) emit(xml);
    },
    resetSimulation: () => {
      simRef.current?.reset();
      publishSim();
    },
  }));

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const modeler = new BpmnModeler({
      container: el,
      keyboard: { bind: false },
      additionalModules: [
        semanticGeometryModule,
        typedTaskPaintModule,
        simulationLockModule,
        createSelectMarqueeModule(() => toolRef.current),
      ],
      /* Default bpmn-js measures external labels at 11px while CSS paints 12px (“Start” → “Star”). */
      textRenderer: {
        defaultStyle: { fontFamily: 'Arial, sans-serif', fontSize: 12 },
        externalStyle: { fontSize: 12 },
      },
    });
    bindKeyboardToHost(modeler.get('keyboard') as EditorKeyboard, canvasKeyboardRef.current ?? el);
    silenceCanvasTabStop(el);
    modelerRef.current = modeler;
    tokenViewRef.current = createTokenView(modeler);

    const canvas = modeler.get('canvas') as CanvasService;
    const eventBus = modeler.get('eventBus') as EventBus;
    let muted = false;
    let fitted = false;
    let lastGoodXml = usableXml(xmlRef.current);
    let displayedXml: string | undefined;

    const writer = {
      importXml: async (next: string, selectId?: string | string[], options?: { fit?: boolean }) => {
        muted = true;
        try {
          const vb = shouldApplyFit(fitted, options?.fit === true) ? undefined : readViewbox(canvas);
          await applyXmlToViewer(modeler, next, {
            displayedXml,
            lastGoodXml,
            container: el,
            afterImport: () => {
              silenceCanvasTabStop(el);
              const registry = modeler.get('elementRegistry') as { get: (id: string) => DiagramElement | undefined };
              const ids = selectId ? (Array.isArray(selectId) ? selectId : [selectId]) : [];
              const shapes = ids.map((id) => registry.get(id)).filter((shape): shape is DiagramElement => !!shape);

              const applyChrome = () => {
                tryResized(canvas);
                if (vb) {
                  try {
                    canvas.viewbox(vb);
                  } catch {
                    /* canvas not ready */
                  }
                } else if (fitRemaining(canvas, overlayRef.current)) {
                  fitted = true;
                }
                if (shapes.length) {
                  (modeler.get('selection') as SelectionService).select(shapes);
                  const shown = shapes[0]!;
                  if (typeof shown.x === 'number' && typeof shown.y === 'number') {
                    panCanvasToShape(
                      canvas,
                      { x: shown.x, y: shown.y, width: shown.width ?? 0, height: shown.height ?? 0 },
                      overlayRef.current,
                    );
                  }
                }
                refreshSelection();
              };
              applyChrome();
              requestAnimationFrame(() => {
                applyChrome();
                requestAnimationFrame(applyChrome);
              });
              if (simulatingRef.current) publishSim();
            },
            afterRestore: () => {
              tryResized(canvas);
              if (fitRemaining(canvas, overlayRef.current)) fitted = true;
              requestAnimationFrame(() => {
                if (fitRemaining(canvas, overlayRef.current)) fitted = true;
              });
            },
          });
          displayedXml = next;
          lastGoodXml = next;
        } catch (error) {
          console.error('BPMN XML import failed', error instanceof Error ? error.message : error);
          throw error;
        } finally {
          muted = false;
        }
      },
      updateLabel: (id: string, name: string) => {
        muted = true;
        labelWriteRef.current = true;
        try {
          applyViewerLabel(modeler, id, name);
        } finally {
          muted = false;
          labelWriteRef.current = false;
        }
      },
    };

    let cancelled = false;
    const sourceXml = usableXml(xmlRef.current);
    void createSemanticEditor(writer, sourceXml).then((session) => {
      if (cancelled) return;
      sessionRef.current = session;
      if (simulatingRef.current) {
        simRef.current = createTokenSimulation(session.process());
        publishSim();
      }

      let dropBusy = false;
      const snapMoved = (payload?: unknown) => {
        if (muted || dropBusy || simulatingRef.current) return;
        const shape = movedShape(payload);
        dropBusy = true;
        const done = shape
          ? session.drop(shape.id, {
              x: (shape.x ?? 0) + (shape.width ?? 0) / 2,
              y: (shape.y ?? 0) + (shape.height ?? 0) / 2,
            })
          : session.bootstrap();
        void done.then(emit).finally(() => {
          dropBusy = false;
        });
      };
      eventBus.on('commandStack.shape.move.executed', snapMoved);
      eventBus.on('commandStack.elements.move.executed', snapMoved);

      const onLabel = (payload?: unknown) => {
        if (muted || simulatingRef.current) return;
        const ctx = (payload as { context?: { element?: { id?: string }; newLabel?: string } } | undefined)?.context;
        const id = ctx?.element?.id;
        if (!id) return;
        try {
          emit(session.rename(id, ctx?.newLabel ?? ''));
        } catch {
          /* flow/gateway labels that the kernel cannot rename stay on the canvas until the next layout */
        }
      };
      eventBus.on('commandStack.element.updateLabel.executed', onLabel);

      void session
        .bootstrap()
        .then((canonicalXml) => {
          if (!cancelled && xmlRef.current === sourceXml && canonicalXml !== sourceXml) emit(canonicalXml);
        })
        .catch((error: Error) => {
          console.error('Failed to import BPMN XML', error);
        });
    });

    const onViewbox = (payload?: unknown) => {
      const next = (payload as { viewbox?: Viewbox } | undefined)?.viewbox;
      if (typeof next?.scale === 'number') setScale(next.scale);
      if ([next?.x, next?.y, next?.width, next?.height].every((value) => typeof value === 'number')) {
        setViewport({ x: next!.x, y: next!.y, width: next!.width, height: next!.height });
      }
      refreshSelection();
    };
    eventBus.on('canvas.viewbox.changed', onViewbox);
    eventBus.on('selection.changed', refreshSelection);
    eventBus.on('elements.changed', refreshSelection);

    const clearHint = () => {
      if (!simulatingRef.current) setHint(null);
    };
    eventBus.on(['create.end', 'create.ended', 'create.cancel'], clearHint);

    const onSimClick = (payload?: unknown) => {
      if (!simulatingRef.current) return;
      const session = sessionRef.current;
      const sim = simRef.current;
      const id = (payload as { element?: { id?: string } } | undefined)?.element?.id;
      if (!session || !sim || !id) return;
      const process = session.process();
      const target = resolveClick(process, sim.snapshot(), id);
      if (!target) {
        setHint(describeSimulation(process, sim.snapshot()));
        return;
      }
      try {
        sim.signal(target.nodeId, target.flowId);
        publishSim();
      } catch (err) {
        tokenViewRef.current?.sync(process, sim.snapshot());
        const status = describeSimulationError(err);
        onSimStatusRef.current?.(status);
        setHint(status);
      }
    };
    eventBus.on('element.click', onSimClick);

    const observer = new ResizeObserver(() => {
      tryResized(canvas);
      if (!fitted && fitRemaining(canvas, overlayRef.current)) fitted = true;
    });
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
      tokenViewRef.current?.clear();
      tokenViewRef.current = null;
      simRef.current = null;
      simChoiceIdsRef.current = [];
      simChoiceIndexRef.current = 0;
      modeler.destroy();
      modelerRef.current = null;
      sessionRef.current = null;
    };
  }, [processId, refreshSelection, emit, publishSim]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isEditorChromeKeyTarget(event.target)) return;
        setCatalogView(null);
        if (simulatingRef.current) {
          event.preventDefault();
          event.stopPropagation();
          onExitSimulationRef.current?.();
          return;
        }
        setValidating(false);
        setHint(null);
        const dragging = modelerRef.current?.get('dragging') as Dragging | undefined;
        dragging?.cancel();
        return;
      }
      if (isEditorChromeKeyTarget(event.target)) return;
      const modeler = modelerRef.current;
      const session = sessionRef.current;
      if (!modeler || !session) return;
      const canvasFocused = event.target === canvasKeyboardRef.current;
      if (simulatingRef.current) {
        if (!canvasFocused) return;
        const sim = simRef.current;
        if (!sim) return;
        const process = session.process();
        const marks = simulationMarks(process, sim.snapshot());
        const activeIds = marks.choice.length ? marks.choice : marks.click;
        if (!activeIds.length) return;
        const selectedId = (modeler.get('selection') as SelectionService).get().map(selectableElement)[0]?.id;
        const selectedIndex = selectedId ? activeIds.indexOf(selectedId) : -1;
        const currentIndex = selectedIndex >= 0 ? selectedIndex : Math.min(simChoiceIndexRef.current, activeIds.length - 1);
        const move = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
            : event.key === 'Home' ? -activeIds.length
              : event.key === 'End' ? activeIds.length
                : 0;
        if (move !== 0) {
          const nextIndex = move === -activeIds.length
            ? 0
            : move === activeIds.length
              ? activeIds.length - 1
              : (currentIndex + move + activeIds.length) % activeIds.length;
          const nextId = activeIds[nextIndex]!;
          simChoiceIndexRef.current = nextIndex;
          const next = (modeler.get('elementRegistry') as ElementRegistry).get(nextId);
          if (next) (modeler.get('selection') as SelectionService).select(next);
          const flow = process.flows.find((item) => item.id === nextId);
          const node = process.nodes.find((item) => item.id === nextId);
          const label = flow?.name?.trim() || node?.name?.trim() || (flow ? `Branch ${nextIndex + 1}` : node?.type ?? nextId);
          event.preventDefault();
          event.stopPropagation();
          setCanvasAnnouncement(`${label}, ${nextIndex + 1} of ${activeIds.length}`);
          setHint(marks.choice.length
            ? `Choose branch: ${label} (${nextIndex + 1} of ${activeIds.length})`
            : `Token on ${label} (${nextIndex + 1} of ${activeIds.length})`);
          return;
        }
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const targetId = activeIds[currentIndex]!;
        const target = resolveClick(process, sim.snapshot(), targetId);
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        try {
          sim.signal(target.nodeId, target.flowId);
          simChoiceIndexRef.current = 0;
          publishSim();
        } catch (err) {
          tokenViewRef.current?.sync(process, sim.snapshot());
          const status = describeSimulationError(err);
          onSimStatusRef.current?.(status);
          setHint(status);
        }
        return;
      }
      if (canvasFocused && isCanvasNavigationKey(event.key)) {
        const registry = modeler.get('elementRegistry') as ElementRegistry;
        const elements = navigableElements(registry);
        const selectedId = (modeler.get('selection') as SelectionService).get().map(selectableElement)[0]?.id;
        const nextId = canvasNavigationTarget(elements.map((element) => element.id), selectedId, event.key);
        const next = nextId ? registry.get(nextId) : undefined;
        if (!next) return;
        event.preventDefault();
        event.stopPropagation();
        (modeler.get('selection') as SelectionService).select(next);
        if (typeof next.x === 'number' && typeof next.y === 'number') {
          panCanvasToShape(
            modeler.get('canvas') as CanvasService,
            { x: next.x, y: next.y, width: next.width ?? 0, height: next.height ?? 0 },
            overlayRef.current,
          );
        }
        const index = elements.findIndex((element) => element.id === next.id);
        const name = next.businessObject?.name?.trim() || next.type.replace(/^bpmn:/, '') || next.id;
        setCanvasAnnouncement(`${name}, ${index + 1} of ${elements.length}`);
        return;
      }
      if (canvasFocused && event.key === 'Enter') {
        const selected = (modeler.get('selection') as SelectionService).get().map(selectableElement)[0];
        if (!selected) return;
        event.preventDefault();
        event.stopPropagation();
        document.querySelector<HTMLInputElement>('.element-inspector [data-element-name]')?.focus();
        return;
      }
      if (isUndoKey(event)) {
        event.preventDefault();
        event.stopPropagation();
        void applyUndo();
        return;
      }
      if (isRedoKey(event)) {
        event.preventDefault();
        event.stopPropagation();
        void applyRedo();
        return;
      }
      if (isCopyKey(event)) {
        const ids = (modeler.get('selection') as SelectionService).get().map((el) => el.id).filter(Boolean);
        if (!session.copy(ids)) return;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (isPasteKey(event)) {
        event.preventDefault();
        event.stopPropagation();
        const selected = (modeler.get('selection') as SelectionService).get();
        const afterId = selected.length === 1 ? selectableElement(selected[0])?.id : undefined;
        void session.paste(afterId).then((xml) => {
          if (xml) emit(xml);
        }).catch((error: Error) => {
          setHint(error.message);
        });
        return;
      }
      if (event.key !== 'Backspace' && event.key !== 'Delete') return;
      if (!canvasFocused && (!(event.target instanceof Element) || !event.target.closest('.djs-container'))) return;
      if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select')) return;
      const selected = (modeler.get('selection') as SelectionService).get();
      const target = selected.map(selectableElement).find((el): el is DiagramElement => !!el);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      void (async () => {
        try {
          emit(await session.remove(target.id));
        } catch {
          deleteSelection(modeler);
          const result = await modeler.saveXML({ format: true });
          if (result.xml) emit(await session.adoptXml(result.xml));
        }
      })();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [applyRedo, applyUndo, emit]);

  useEffect(() => {
    const host = overlayRef.current;
    const canvas = modelerRef.current?.get('canvas') as CanvasService | undefined;
    if (!host || !canvas) return;

    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.element-inspector, .bpmn-zoom-controls, button, input, textarea, select')) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        (modelerRef.current?.get('zoomScroll') as ZoomScrollService | undefined)?.stepZoom(event.deltaY < 0 ? 1 : -1);
        return;
      }
      let viewbox: Viewbox;
      try {
        viewbox = canvas.viewbox();
      } catch {
        return;
      }
      const outer = viewbox.outer ?? { width: host.clientWidth, height: host.clientHeight };
      const line = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? outer.height : 1;
      const dx = event.deltaX * line * (viewbox.width / Math.max(1, outer.width));
      const dy = event.deltaY * line * (viewbox.height / Math.max(1, outer.height));
      try {
        canvas.viewbox({ ...viewbox, x: viewbox.x + dx, y: viewbox.y + dy });
      } catch {
        /* The canvas can be between imports; the next wheel event will retry. */
      }
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [simulating]);

  useEffect(() => {
    const timer = window.setTimeout(() => setLintXml(currentXml), 250);
    return () => window.clearTimeout(timer);
  }, [currentXml]);

  useEffect(() => {
    simulationLock.on = simulating;
    if (simulating) setValidating(false);
    const session = sessionRef.current;
    if (!simulating || !session) {
      simRef.current = null;
      tokenViewRef.current?.clear();
      onSimStatusRef.current?.('');
      if (!simulating) setHint(null);
      return;
    }
    const modeler = modelerRef.current;
    const hand = modeler?.get('handTool') as HandTool | undefined;
    const dragging = modeler?.get('dragging') as Dragging | undefined;
    dragging?.cancel();
    if (hand?.isActive()) hand.toggle();
    spacePanHoldRef.current = createSpacePanHold();
    toolRef.current = 'select';
    setTool('select');
    simRef.current = createTokenSimulation(session.process());
    publishSim();
    return () => {
      simulationLock.on = false;
    };
  }, [simulating, processId, publishSim]);

  const zoomIn = useCallback(() => {
    (modelerRef.current?.get('zoomScroll') as ZoomScrollService | undefined)?.stepZoom(1);
  }, []);

  const zoomOut = useCallback(() => {
    (modelerRef.current?.get('zoomScroll') as ZoomScrollService | undefined)?.stepZoom(-1);
  }, []);

  const fit = useCallback(() => {
    const canvas = modelerRef.current?.get('canvas') as CanvasService | undefined;
    if (!canvas) return;
    try {
      fitRemaining(canvas, overlayRef.current);
    } catch {
      tryResized(canvas);
    }
  }, []);

  useEffect(() => {
    const canvas = modelerRef.current?.get('canvas') as CanvasService | undefined;
    if (!canvas) return;
    try {
      fitRemaining(canvas, overlayRef.current);
    } catch {
      tryResized(canvas);
    }
  }, [compact]);

  const reset = useCallback(() => {
    (modelerRef.current?.get('canvas') as CanvasService | undefined)?.zoom(1);
  }, []);

  const handleTool = useCallback((next: 'select' | 'pan') => {
    if (next === 'pan') setCatalogView(null);
    toolRef.current = next;
    setTool(next);
    const modeler = modelerRef.current;
    if (!modeler) return;
    const hand = modeler.get('handTool') as HandTool;
    const dragging = modeler.get('dragging') as Dragging;
    dragging.cancel();
    if (hand.isActive()) hand.toggle();
  }, []);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      const ignore = isEditorChromeKeyTarget(event.target) || simulatingRef.current;
      const next = applySpacePanDown(event, toolRef.current, spacePanHoldRef.current, ignore);
      if (next) handleTool(next);
    };
    const onUp = (event: KeyboardEvent) => {
      const next = applySpacePanUp(event, spacePanHoldRef.current);
      if (next) handleTool(next);
    };
    const onBlur = () => {
      const next = releaseSpacePan(spacePanHoldRef.current);
      if (next) handleTool(next);
    };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [handleTool]);

  const handleArchitect = useCallback(
    async (message: string, history: ChatTurn[], scope: AgentScope, signal: AbortSignal) => {
      const session = sessionRef.current;
      if (!session || simulatingRef.current) throw new Error('Editor is not ready');
      const graph = session.process();
      const data = await runAssistant({
        message,
        history,
        process: graph,
        processName: graph.name,
        scope,
        signal,
      });
      if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      const result = await applyAssistantResult(session, data, scope);
      if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      if (result.applied) emit(result.xml);
      return result;
    },
    [emit],
  );

  const handlePick = useCallback(
    async (item: BpmnComponentDefinition, target?: InsertTarget) => {
      const session = sessionRef.current;
      if (!session || simulatingRef.current) return;
      const insert = resolveInsert(selection, session.process(), target);
      if (insert.blocked) {
        setCatalogView(null);
        setQuery('');
        setHint(editorNoticeText(new Error('ambiguous after split: pass branchId')));
        return;
      }
      const result = await pickCatalogItem(
        item,
        selection,
        {
          create: async (catalogId, afterId, place) => {
            const { xml: next } = await session.create(catalogId, afterId, place);
            emit(next);
            return true;
          },
        },
        insert.target,
      );
      setCatalogView(null);
      setQuery('');
      setHint(result?.hint ?? null);
    },
    [selection, emit],
  );

  const replaceWorks = useCallback(
    (def: BpmnComponentDefinition) => {
      const session = sessionRef.current;
      if (!session || !selection) return false;
      if (def.bpmnType === 'bpmn:SequenceFlow') return true;
      try {
        replaceBpmnType(session.process(), selection.id, def.bpmnType);
        return true;
      } catch {
        const modeler = modelerRef.current;
        return modeler ? canReplaceWithBpmnJs(modeler, selection, def) : false;
      }
    },
    [selection],
  );

  const lint = useMemo(() => lintLiveBpmnXml(lintXml), [lintXml]);
  const findings = useMemo(() => presentedFindings(lint), [lint]);
  const findingCounts = useMemo(() => ({
    errors: findings.filter((finding) => finding.severity === 'error').length,
    warnings: findings.filter((finding) => finding.severity === 'warning').length,
    style: findings.filter((finding) => finding.severity === 'style').length,
  }), [findings]);

  useEffect(() => {
    const canvas = modelerRef.current?.get('canvas') as CanvasService | undefined;
    if (!canvas?.addMarker || !canvas.removeMarker) return;
    for (const id of lintMarkerIdsRef.current) canvas.removeMarker(id, 'lint-error');
    const next = validating
      ? new Set(lint.errors.map((finding) => finding.elementId).filter((id): id is string => !!id))
      : new Set<string>();
    for (const id of next) canvas.addMarker(id, 'lint-error');
    lintMarkerIdsRef.current = next;
    return () => {
      for (const id of next) canvas.removeMarker?.(id, 'lint-error');
    };
  }, [lint, validating]);

  const selectValidationFinding = useCallback((elementId: string) => {
    const modeler = modelerRef.current;
    if (!modeler) return;
    const target = (modeler.get('elementRegistry') as ElementRegistry).get(elementId);
    if (!target) return;
    (modeler.get('selection') as SelectionService).select(target);
    if (typeof target.x === 'number' && typeof target.y === 'number') {
      panCanvasToShape(
        modeler.get('canvas') as CanvasService,
        { x: target.x, y: target.y, width: target.width ?? 0, height: target.height ?? 0 },
        overlayRef.current,
      );
    }
    refreshSelection();
  }, [refreshSelection]);

  const poolLanes = useMemo(() => {
    if (selection?.type !== 'bpmn:Participant') return [];
    return lanesInPool(sessionRef.current?.process().lanes ?? [], selection.id);
  }, [selection, currentXml, graphRev]);

  const nodeLane = useMemo(
    () => flowNodeLaneAssignment(selection, sessionRef.current?.process()),
    [selection, currentXml, graphRev],
  );

  const graph = sessionRef.current?.process();
  const insertAt = continueTarget(selection, graph);
  const continueSource =
    selection && (isSequenceFlowSource(selection) || isSequenceFlowElement(selection)) ? selection : null;
  const chrome = visibleEditorChrome(Boolean(onboarding && !simulating), simulating ? null : hint);

  const agentCtx = useMemo(() => {
    const session = sessionRef.current;
    if (!session) return { branchLocked: false, selectionIds: selectedIds };
    return resolveAgentContext(session.process(), selectedIds);
  }, [selectedIds, currentXml, lockRev, graphRev]);

  return (
    <div className={`bpmn-stage bpmn-editor-stage flex${simulating ? ' is-simulating' : ''}${tool === 'pan' ? ' is-pan' : ''}${canvasItems.length > LARGE_DIAGRAM_SHAPES ? ' is-large-diagram' : ''}${canvasItems.length > LARGE_DIAGRAM_SHAPES && scale < 0.4 ? ' is-low-detail' : ''}`}>
      <PaletteRail
        tool={tool}
        catalogView={catalogView}
        query={query}
        selection={selection}
        hasParticipant={hasParticipant}
        onTool={handleTool}
        onOpenCatalog={(view) => {
          const modeler = modelerRef.current;
          const hand = modeler?.get('handTool') as HandTool | undefined;
          const dragging = modeler?.get('dragging') as Dragging | undefined;
          dragging?.cancel();
          if (hand?.isActive()) hand.toggle();
          toolRef.current = 'select';
          setTool('select');
          setQuery('');
          setValidating(false);
          setCatalogView(view);
        }}
        onQueryChange={setQuery}
        onCloseCatalog={() => {
          setCatalogView(null);
          setQuery('');
        }}
        onPick={(entry: ResolvedCatalogItem) => {
          if (!entry.enabled) return;
          void handlePick(entry.item);
        }}
      />
      <div ref={overlayRef} className="bpmn-canvas-host">
        <BpmnCanvas
          ref={canvasRef}
          keyboardRef={canvasKeyboardRef}
          items={canvasItems}
          selectedIds={selectedIds}
          simulating={simulating}
        />
        <span className="sr-only" role="status" aria-live="polite">
          {canvasAnnouncement}
        </span>
        {simulating ? (
          <ModeBar mode="Simulating" detail={hint ?? 'Pick an available path on the diagram.'} meta="Read-only" />
        ) : validating ? (
          <ModeBar
            mode="Validating"
            detail={`${findingCounts.errors} ${findingCounts.errors === 1 ? 'error' : 'errors'} · ${findingCounts.warnings} ${findingCounts.warnings === 1 ? 'warning' : 'warnings'} · ${findingCounts.style} style`}
            meta="Esc to exit"
          />
        ) : (
          <ModeBar
            mode="Editing"
            detail={selection ? `Selected · ${selection.businessObject?.name?.trim() || readableBpmnType(selection.type)}` : 'Select an element or add the next step.'}
            meta={canvasItems.length > 1_000 ? 'Large diagram · consider subprocesses' : `${findings.length} ${findings.length === 1 ? 'finding' : 'findings'}`}
          />
        )}
        <BpmnZoomControls scale={scale} onZoomIn={zoomIn} onZoomOut={zoomOut} onFit={fit} onReset={reset} />
        <BpmnMinimap
          items={canvasItems}
          viewport={viewport}
          onNavigate={(next) => {
            (modelerRef.current?.get('canvas') as CanvasService | undefined)?.viewbox(next);
          }}
        />
        {toast ? (
          <Toast
            message={toast.message}
            actionLabel={toast.action === 'redo' ? 'Redo' : 'Undo'}
            onAction={() => void (toast.action === 'redo' ? applyRedo() : applyUndo())}
            onDismiss={() => setToast(null)}
          />
        ) : null}
        {continueSource && anchor && !simulating ? (
          <ContinueWith
            key={continueSource.id}
            source={continueSource}
            hasParticipant={hasParticipant}
            anchor={anchor}
            target={insertAt.target}
            choices={insertAt.choices}
            onPick={(item, _event, target) => void handlePick(item, target)}
          />
        ) : null}
        {chrome === 'hint' ? (
          <div className={`palette-hint${simulating ? ' is-sim' : ''}`} role="status">
            {hint}
          </div>
        ) : chrome === 'onboarding' ? (
          <EditorOnboarding compact={compact} onDismiss={() => setOnboarding(false)} />
        ) : null}
      </div>
      <InspectorShell>
        {validating ? (
          <ValidationPanel lint={lint} onClose={() => setValidating(false)} onSelect={selectValidationFinding} />
        ) : selection ? (
          <ElementInspector
            framed={false}
            element={selection}
            readOnly={simulating}
            canDelete={canDelete && !simulating}
            lint={lint}
            replaceWorks={replaceWorks}
            onRename={(name) => {
              if (simulating) return;
              try {
                const next = sessionRef.current?.rename(selection.id, name);
                if (next) emit(next);
              } catch {
                /* kernel persistence of this id is owned elsewhere; keep inspector selection */
              }
            }}
            onRenameLane={(laneId, name) => {
              if (simulating) return;
              try {
                const next = sessionRef.current?.rename(laneId, name);
                if (next) emit(next);
              } catch {
                /* kernel persistence of this id is owned elsewhere; keep inspector selection */
              }
            }}
            onChangeTo={(def) => {
              if (simulating) return;
              const session = sessionRef.current;
              if (!session) return;
              void session
                .replace(selection.id, def)
                .then(emit)
                .catch(() => {
                  const modeler = modelerRef.current;
                  if (!modeler) return;
                  replaceElement(modeler, selection.id, def);
                  void modeler.saveXML({ format: true }).then((result) => {
                    if (result.xml) void session.adoptXml(result.xml).then(emit);
                  });
                });
            }}
            onDelete={() => {
              if (simulating) return;
              const session = sessionRef.current;
              const modeler = modelerRef.current;
              if (!session || !modeler) return;
              void session
                .remove(selection.id)
                .then(emit)
                .catch(() => {
                  deleteSelection(modeler);
                  void modeler.saveXML({ format: true }).then((result) => {
                    if (result.xml) void session.adoptXml(result.xml).then(emit);
                  });
                });
            }}
            onFlowKind={(kind: FlowKind) => {
              if (simulating) return;
              void sessionRef.current?.setFlowKind(selection.id, kind).then(emit);
            }}
            onCondition={(flowId, body) => {
              if (simulating) return;
              void sessionRef.current?.setCondition(flowId, body).then(emit);
            }}
            onDefaultOutgoing={(flowId) => {
              if (simulating) return;
              void sessionRef.current?.setFlowKind(flowId, 'default').then(emit);
            }}
            onCalledElement={(calledElement) => {
              if (simulating) return;
              void sessionRef.current?.setCalledElement(selection.id, calledElement).then(emit);
            }}
            process={graph}
            onPreservedChange={(change) => {
              if (simulating) return;
              const session = sessionRef.current;
              if (!session) return;
              void commitPreservedChange(session, change).then(emit);
            }}
            onAttach={(def) => {
              if (simulating) return;
              const session = sessionRef.current;
              if (!session) return;
              void session
                .create(def.id, selection.id)
                .then((result) => emit(result.xml))
                .catch(() => {
                  const modeler = modelerRef.current;
                  if (!modeler) return;
                  attachBoundary(modeler, selection.id, def);
                  void modeler.saveXML({ format: true }).then((result) => {
                    if (result.xml) void session.adoptXml(result.xml).then(emit);
                  });
                });
            }}
            onCreate={(def) => {
              if (simulating) return;
              const session = sessionRef.current;
              if (!session) return;
              void session
                .create(def.id, selection.id)
                .then((result) => {
                  emit(result.xml);
                  setHint(null);
                })
                .catch((err) => {
                  setHint(err instanceof Error ? err.message : String(err));
                });
            }}
            onAssignLane={(laneId) => {
              if (simulating) return;
              void sessionRef.current?.assignLane(selection.id, laneId).then(emit);
            }}
            poolLanes={poolLanes}
            nodeLanes={nodeLane.lanes}
            currentLaneId={nodeLane.currentLaneId}
            onValidate={() => {
              setCatalogView(null);
              setValidating(true);
            }}
          />
        ) : (
          <InspectorLintFooter
            lint={lint}
            onValidate={() => {
              setCatalogView(null);
              setValidating(true);
            }}
          />
        )}
      </InspectorShell>
      <ArchitectPanel
        disabled={simulating}
        configured={aiConfigured}
        context={agentCtx}
        onProtectBranch={
          agentCtx.branchId && !simulating
            ? (locked) => {
                const id = agentCtx.branchId;
                if (!id) return;
                sessionRef.current?.setBranchLocked(id, locked);
                setLockRev((n) => n + 1);
              }
            : undefined
        }
        onApply={handleArchitect}
      />
    </div>
  );
});
