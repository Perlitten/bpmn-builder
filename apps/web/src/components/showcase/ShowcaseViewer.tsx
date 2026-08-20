import { useEffect, useRef } from 'react';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';

type ShowcaseViewerProps = {
  xml: string;
};

export function ShowcaseViewer({ xml }: ShowcaseViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<NavigatedViewer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const viewer = new NavigatedViewer({
      container: containerRef.current,
      textRenderer: {
        defaultStyle: { fontFamily: 'Arial, sans-serif', fontSize: 12 },
        externalStyle: { fontSize: 12 },
      },
    });
    viewerRef.current = viewer;

    return () => {
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
        if (!active) return;
        const canvas = viewer.get('canvas') as {
          zoom: (val: string, center?: string) => void;
          resized: () => void;
        };
        try {
          canvas.resized();
          canvas.zoom('fit-viewport');
        } catch {
          /* ignore canvas fit errors */
        }
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
