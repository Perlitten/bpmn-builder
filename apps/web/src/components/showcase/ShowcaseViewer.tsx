import { useEffect, useRef } from 'react';
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

  return <div ref={containerRef} className="h-full w-full min-h-[220px] bg-canvas" />;
}
