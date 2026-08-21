import { useEffect, useState } from 'react';
import { previewLayoutSvg } from '../../lib/layoutPreview';
import { useModal } from '../ui/useModal';

type ShowcaseViewerProps = { xml: string };

export function ShowcaseViewer({ xml }: ShowcaseViewerProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { ref: modalRef } = useModal({ open: isFullscreen, onClose: () => setIsFullscreen(false) });

  useEffect(() => {
    let cancelled = false;
    void previewLayoutSvg(xml).then((next) => {
      if (!cancelled) setSvg(next);
    });
    return () => {
      cancelled = true;
    };
  }, [xml]);

  useEffect(() => {
    if (!isFullscreen) return;
    const main = modalRef.current?.closest('main');
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
  }, [isFullscreen, modalRef]);

  return (
    <div
      ref={modalRef}
      role={isFullscreen ? 'dialog' : undefined}
      aria-modal={isFullscreen ? 'true' : undefined}
      aria-label={isFullscreen ? 'Fullscreen process preview' : undefined}
      tabIndex={isFullscreen ? -1 : undefined}
      className={
        isFullscreen
          ? 'fixed inset-0 z-[var(--z-dialog)] flex flex-col bg-canvas outline-none'
          : 'relative flex h-full min-h-[220px] w-full flex-col bg-canvas'
      }
    >
      <div className={`absolute right-2 top-2 z-[var(--z-zoom)] ${isFullscreen ? '' : 'lg:hidden'}`}>
        <button
          type="button"
          data-modal-initial-focus={isFullscreen ? true : undefined}
          onClick={() => setIsFullscreen((current) => !current)}
          className="min-h-[44px] border border-border bg-canvas px-3 text-sm font-medium text-ink hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
        >
          {isFullscreen ? 'Close' : 'Fullscreen'}
        </button>
      </div>
      {svg ? (
        <div
          className="pointer-events-none min-h-[220px] flex-1 p-4 text-ink [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          role="img"
          aria-label="Generated BPMN process preview"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="grid min-h-[220px] flex-1 place-items-center font-mono text-[10px] tracking-[0.14em] text-muted">
          BUILDING DIAGRAM
        </div>
      )}
      {isFullscreen ? (
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 bg-ink/80 px-3 py-1.5 text-xs text-canvas">
          Canonical BPMN layout preview
        </p>
      ) : null}
    </div>
  );
}
