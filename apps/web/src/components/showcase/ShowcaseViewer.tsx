import { useEffect, useRef, useState } from 'react';
import Viewer from 'bpmn-js/lib/Viewer';
import { useModal } from '../ui/useModal';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';

type ShowcaseViewerProps = {
  xml: string;
};

type CanvasService = {
  zoom: (value: string | number, center?: { x: number; y: number }) => number;
  resized: () => void;
};

function fitViewer(viewer: Viewer, minimumZoom = 0): void {
  const canvas = viewer.get('canvas') as CanvasService;
  try {
    canvas.resized();
    const fittedZoom = canvas.zoom('fit-viewport', minimumZoom > 0 ? { x: 0, y: 0 } : undefined);
    if (minimumZoom > 0 && fittedZoom < minimumZoom) {
      canvas.zoom(minimumZoom);
    }
  } catch {
    /* The canvas can be temporarily empty while XML is being replaced. */
  }
}

export function ShowcaseViewer({ xml }: ShowcaseViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const fullscreenRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  fullscreenRef.current = isFullscreen;
  const { ref: modalRef } = useModal({
    open: isFullscreen,
    onClose: () => setIsFullscreen(false),
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const viewer = new Viewer({
      container,
      textRenderer: {
        defaultStyle: { fontFamily: 'Arial, sans-serif', fontSize: 12 },
        externalStyle: { fontSize: 12 },
      },
    });
    viewerRef.current = viewer;

    const observer = new ResizeObserver(() => fitViewer(viewer, fullscreenRef.current ? 0.85 : 0));
    observer.observe(container);

    return () => {
      observer.disconnect();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !xml) return;
    let active = true;

    viewer
      .importXML(xml)
      .then(() => {
        if (active) fitViewer(viewer, fullscreenRef.current ? 0.85 : 0);
      })
      .catch((err: unknown) => {
        console.error('Failed to import BPMN XML in showcase viewer', err);
      });

    return () => {
      active = false;
    };
  }, [xml]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const frame = requestAnimationFrame(() => fitViewer(viewer, isFullscreen ? 0.85 : 0));
    return () => cancelAnimationFrame(frame);
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const main = containerRef.current?.closest('main');
    const previousMainOverflow = main?.style.overflow ?? '';
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    if (main instanceof HTMLElement) main.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      if (main instanceof HTMLElement) main.style.overflow = previousMainOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isFullscreen]);

  return (
    <div
      ref={modalRef}
      role={isFullscreen ? 'dialog' : undefined}
      aria-modal={isFullscreen ? 'true' : undefined}
      aria-label={isFullscreen ? 'Fullscreen process preview' : undefined}
      tabIndex={isFullscreen ? -1 : undefined}
      className={`${
        isFullscreen
          ? 'fixed inset-0 z-[400] flex flex-col bg-canvas outline-none'
          : 'relative flex h-full w-full flex-col min-h-[220px] bg-canvas'
      }`}
    >
      <div className={`absolute right-2 top-2 z-10 ${isFullscreen ? '' : 'lg:hidden'}`}>
        <button
          type="button"
          data-modal-initial-focus={isFullscreen ? true : undefined}
          onClick={() => setIsFullscreen((current) => !current)}
          className="rounded border border-border bg-canvas px-3 min-h-[44px] text-sm font-medium text-ink shadow-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
        >
          {isFullscreen ? 'Close' : 'Fullscreen'}
        </button>
      </div>
      <div ref={containerRef} className="min-h-[220px] flex-1" />
      {isFullscreen ? (
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-ink/80 px-3 py-1.5 text-xs text-canvas shadow-sm">
          Drag to pan · pinch or scroll to zoom
        </p>
      ) : null}
    </div>
  );
}
