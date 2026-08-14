import { useEffect, useState } from 'react';
import type { BpmnPreview } from '../../lib/bpmnPreview';
import { peekLayoutPreviewSvg, previewLayoutSvg } from '../../lib/layoutPreview';

type BpmnSchematicProps = {
  xml?: string | null;
  preview: BpmnPreview;
};

function useLayoutPreview(xml: string | null | undefined): string | null | undefined {
  const [svg, setSvg] = useState<string | null | undefined>(() => peekLayoutPreviewSvg(xml));

  useEffect(() => {
    if (!xml?.trim()) {
      setSvg(null);
      return;
    }
    let cancelled = false;
    const peeked = peekLayoutPreviewSvg(xml);
    if (peeked !== undefined) {
      setSvg(peeked);
      return;
    }
    setSvg(undefined);
    void previewLayoutSvg(xml).then((next) => {
      if (!cancelled) setSvg(next);
    });
    return () => {
      cancelled = true;
    };
  }, [xml]);

  return svg;
}

function AsciiFallback({ preview }: { preview: BpmnPreview }) {
  return (
    <div className="min-w-0 font-mono text-[11px] leading-4 text-muted">
      <div className="flex min-w-0 items-baseline gap-2">
        {preview.kind === 'starter' ? (
          <span className="shrink-0 text-[10px] uppercase tracking-wide">Starter</span>
        ) : null}
        <span className="truncate">{preview.happyPath}</span>
      </div>
      {preview.branches.map((branch, index) => (
        <div key={`${index}:${branch}`} className="truncate pl-3">
          └ {branch}
        </div>
      ))}
    </div>
  );
}

export function BpmnSchematic({ xml, preview }: BpmnSchematicProps) {
  const svg = useLayoutPreview(xml);
  const caption = [preview.happyPath, ...preview.branches.map((branch) => `└ ${branch}`)].join(' ');

  if (svg) {
    return (
      <div
        className="pointer-events-none h-7 min-w-0 overflow-hidden text-ink [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
        role="img"
        aria-label={caption}
        title={caption}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  if (svg === undefined) {
    return <div className="h-7 min-w-0" aria-hidden="true" />;
  }

  return <AsciiFallback preview={preview} />;
}
