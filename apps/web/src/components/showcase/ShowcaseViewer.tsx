import { useEffect, useRef, useState } from 'react';
import Viewer from 'bpmn-js/lib/Viewer';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';

type ShowcaseViewerProps = {
  xml: string;
};

type CanvasService = {
  zoom: (value: string) => void;
  resized: () => void;
};

function fitViewer(viewer: Viewer): void {
  const canvas = viewer.get('canvas') as CanvasService;
  try {
    canvas.resized();
    canvas.zoom('fit-viewport');
  } catch {
    /* The canvas can be temporarily empty while XML is being replaced. */
  }
}

export function ShowcaseViewer({ xml }: ShowcaseViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

    const observer = new ResizeObserver(() => fitViewer(viewer));
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
        if (active) fitViewer(viewer);
      })
      .catch((err: unknown) => {
        console.error('Failed to import BPMN XML in showcase viewer', err);
      });

    return () => {
      active = false;
    };
  }, [xml]);

  // When toggling fullscreen, trigger a resize to ensure it fits the new bounds
  useEffect(() => {
    if (viewerRef.current) {
      fitViewer(viewerRef.current);
    }
  }, [isFullscreen]);

  return (
    <div
      className={`${
        isFullscreen
          ? 'fixed inset-0 z-50 flex flex-col bg-canvas'
          : 'relative flex h-full w-full flex-col min-h-[220px] bg-canvas'
      }`}
    >
      <div className="absolute top-2 right-2 z-10 lg:hidden">
        <button
          type="button"
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="rounded border border-border bg-canvas px-3 min-h-[44px] text-sm font-medium text-ink shadow-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={isFullscreen ? "Exit fullscreen" : "View fullscreen"}
        >
          {isFullscreen ? 'Close' : 'Fullscreen'}
        </button>
      </div>
      <div ref={containerRef} className="flex-1 min-h-[220px]" />
    </div>
  );
}
