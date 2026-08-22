import { useId, type CSSProperties } from 'react';
import type { ProcessMiniPreview } from '@bpmn/domain';

type BpmnSchematicProps = {
  preview: ProcessMiniPreview;
  className?: string;
  variant?: 'compact' | 'detail';
  zoom?: number;
  compactLayout?: boolean;
};

type PositionedNode = ProcessMiniPreview['nodes'][number] & {
  px: number;
  py: number;
  width: number;
  height: number;
};

function dimensions(type: string): { width: number; height: number } {
  const lower = type.toLowerCase();
  if (lower.includes('event')) return { width: 36, height: 36 };
  if (lower.includes('gateway')) return { width: 44, height: 44 };
  return { width: 100, height: 48 };
}

function positioned(
  preview: ProcessMiniPreview,
  detailLayout: boolean,
  compactLayout: boolean,
): PositionedNode[] {
  const nodes = preview.nodes.map((node, index) => ({
    ...node,
    px: typeof node.x === 'number' ? node.x : index * 140,
    py: typeof node.y === 'number' ? node.y : 0,
    ...dimensions(node.type),
  }));
  if (!detailLayout || nodes.length < 2) return nodes;
  const columns = [...new Set(nodes.map((node) => node.px))].sort((a, b) => a - b);
  const mapped = new Map<number, number>();
  let cursor = 0;
  for (const column of columns) {
    mapped.set(column, cursor);
    const width = Math.max(...nodes.filter((node) => node.px === column).map((node) => node.width));
    cursor += width + (compactLayout ? 8 : 48);
  }
  const maxRows = Math.max(...columns.map((column) => nodes.filter((node) => node.px === column).length));
  const rowGap = compactLayout ? 32 : 64;
  const rowHeight = 48;
  const totalHeight = maxRows * rowHeight + Math.max(0, maxRows - 1) * rowGap;
  return columns.flatMap((column) => {
    const columnNodes = nodes.filter((node) => node.px === column).sort((a, b) => a.py - b.py);
    if (columnNodes.length === 1) {
      const node = columnNodes[0]!;
      return [{ ...node, px: mapped.get(column) ?? node.px, py: (totalHeight - node.height) / 2 }];
    }
    const available = Math.max(0, totalHeight - rowHeight);
    return columnNodes.map((node, index) => ({
      ...node,
      px: mapped.get(column) ?? node.px,
      py: (available * index) / Math.max(1, columnNodes.length - 1) + (rowHeight - node.height) / 2,
    }));
  });
}

function labelLines(label: string): string[] {
  const normalized = label.trim().replace(/\s+/g, ' ') || 'Task';
  if (normalized.length <= 16) return [normalized];
  const words = normalized.split(' ');
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current || (current.length + word.length + 1 > 16 && lines.length < 2)) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${current} ${word}`;
    }
  }
  if (lines.length > 2) lines[1] = `${lines.slice(1).join(' ').slice(0, 15).trimEnd()}…`;
  return lines.slice(0, 2);
}

function NodeShape({ node, detail }: { node: PositionedNode; detail: boolean }) {
  const centerX = node.px + node.width / 2;
  const centerY = node.py + node.height / 2;
  const lower = node.type.toLowerCase();
  if (lower.includes('event')) {
    return (
      <g>
        <circle cx={centerX} cy={centerY} r={node.width / 2 - 2} fill="var(--color-canvas)" stroke="currentColor" strokeWidth="2" />
        {lower.includes('end') ? (
          <circle cx={centerX} cy={centerY} r={node.width / 2 - 6} fill="none" stroke="currentColor" strokeWidth="2" />
        ) : null}
      </g>
    );
  }
  if (lower.includes('gateway')) {
    return (
      <g>
        <path
          d={`M ${centerX} ${node.py + 1} L ${node.px + node.width - 1} ${centerY} L ${centerX} ${node.py + node.height - 1} L ${node.px + 1} ${centerY} Z`}
          fill="var(--color-canvas)"
          stroke="currentColor"
          strokeWidth="2"
        />
        {lower.includes('parallel') ? (
          <path
            d={`M ${centerX - 8} ${centerY} H ${centerX + 8} M ${centerX} ${centerY - 8} V ${centerY + 8}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        ) : (
          <path
            d={`M ${centerX - 7} ${centerY - 7} L ${centerX + 7} ${centerY + 7} M ${centerX + 7} ${centerY - 7} L ${centerX - 7} ${centerY + 7}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        )}
      </g>
    );
  }
  const lines = labelLines(node.label);
  return (
    <g>
      <rect
        x={node.px + 1}
        y={node.py + 1}
        width={node.width - 2}
        height={node.height - 2}
        rx="2"
        fill="var(--color-canvas)"
        stroke="currentColor"
        strokeWidth="2"
      />
      {detail ? (
        <text x={centerX} y={centerY - (lines.length - 1) * 6 + 3} textAnchor="middle" fontSize="10" fill="currentColor">
          {lines.map((line, index) => (
            <tspan key={`${line}:${index}`} x={centerX} dy={index === 0 ? 0 : 12}>{line}</tspan>
          ))}
        </text>
      ) : null}
    </g>
  );
}

function CollaborationFrame({
  preview,
  minX,
  minY,
  maxX,
  maxY,
}: {
  preview: ProcessMiniPreview;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}) {
  // We only know aggregate collaboration counts in a list preview. A pool
  // outline is truthful for one participant; drawing one outline around a
  // multi-pool collaboration would incorrectly imply that all nodes share a
  // pool (and that sequence flows cross its boundary).
  if (preview.participants !== 1) return null;
  const x = minX + 4;
  const y = minY + 4;
  const width = Math.max(1, maxX - minX - 8);
  const height = Math.max(1, maxY - minY - 8);
  const header = Math.min(20, height / 3);
  const lanes = Math.max(0, preview.lanes ?? 0);
  return (
    <g aria-hidden="true" opacity="0.65">
      <rect x={x} y={y} width={width} height={height} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1={x} y1={y + header} x2={x + width} y2={y + header} stroke="currentColor" strokeWidth="1" />
      {lanes > 1
        ? Array.from({ length: lanes - 1 }, (_, index) => {
            const laneY = y + header + ((height - header) * (index + 1)) / lanes;
            return <line key={laneY} x1={x} y1={laneY} x2={x + width} y2={laneY} stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 3" />;
          })
        : null}
    </g>
  );
}

function collaborationDescription(preview: ProcessMiniPreview): string {
  return [
    preview.participants ? `${preview.participants} ${preview.participants === 1 ? 'pool' : 'pools'}` : '',
    preview.lanes ? `${preview.lanes} ${preview.lanes === 1 ? 'lane' : 'lanes'}` : '',
    preview.messageFlows ? `${preview.messageFlows} message ${preview.messageFlows === 1 ? 'flow' : 'flows'}` : '',
    preview.boundaryEvents ? `${preview.boundaryEvents} boundary ${preview.boundaryEvents === 1 ? 'event' : 'events'}` : '',
  ].filter(Boolean).join(' · ');
}

/**
 * This is intentionally a legend, not a guessed pool layout. The preview DTO
 * has counts but no node-to-participant/lane ownership, so a separate summary
 * prevents the sequence-flow thumbnail from masquerading as a full
 * collaboration diagram.
 */
function CollaborationSummary({
  label,
  minX,
  minY,
  maxX,
}: {
  label: string;
  minX: number;
  minY: number;
  maxX: number;
}) {
  if (!label) return null;
  const x = minX + 4;
  const y = minY + 2;
  const width = Math.max(1, maxX - minX - 8);
  return (
    <g aria-hidden="true" opacity="0.75">
      <rect x={x} y={y} width={width} height="14" fill="var(--color-canvas)" stroke="currentColor" strokeWidth="0.75" />
      <path d={`M ${x + 5} ${y + 4} H ${x + 13} V ${y + 10} H ${x + 5} Z M ${x + 8} ${y + 2} H ${x + 16} V ${y + 8} H ${x + 8} Z`} fill="none" stroke="currentColor" strokeWidth="0.75" />
      <text x={x + 21} y={y + 10} fontSize="8" fill="currentColor">{label}</text>
    </g>
  );
}

export function BpmnSchematic({
  preview,
  className = '',
  variant = 'compact',
  zoom = 1,
  compactLayout = false,
}: BpmnSchematicProps) {
  const markerId = `mini-arrow-${useId().replaceAll(':', '')}`;
  const nodes = positioned(preview, variant === 'detail', compactLayout);
  if (!nodes.length) return <span className="font-mono text-[10px] text-muted">No diagram</span>;

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const minX = Math.min(...nodes.map((node) => node.px)) - 8;
  const contentMinY = Math.min(...nodes.map((node) => node.py)) - 8;
  const maxX = Math.max(...nodes.map((node) => node.px + node.width)) + 12;
  const maxY = Math.max(...nodes.map((node) => node.py + node.height)) + 8;
  const collaborationLabel = collaborationDescription(preview);
  const minY = contentMinY - (collaborationLabel ? 18 : 0);
  const ariaLabel = collaborationLabel
    ? `${preview.caption} · Sequence-flow preview; collaboration: ${collaborationLabel}`
    : preview.caption;

  return (
    <svg
      viewBox={`${minX} ${minY} ${Math.max(1, maxX - minX)} ${Math.max(1, maxY - minY)}`}
      className={`bpmn-schematic block h-9 w-full text-ink ${className}`}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="xMidYMid meet"
      style={{ '--schematic-zoom': zoom } as CSSProperties}
    >
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      <CollaborationSummary label={collaborationLabel} minX={minX} minY={minY} maxX={maxX} />
      <CollaborationFrame preview={preview} minX={minX} minY={contentMinY} maxX={maxX} maxY={maxY} />
      {preview.edges.map((edge, index) => {
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        if (!source || !target) return null;
        const x1 = source.px + source.width;
        const y1 = source.py + source.height / 2;
        const x2 = target.px;
        const y2 = target.py + target.height / 2;
        const midX = x1 + Math.max(18, (x2 - x1) / 2);
        return (
          <path
            key={`${edge.source}:${edge.target}:${index}`}
            d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            markerEnd={`url(#${markerId})`}
          />
        );
      })}
      {nodes.map((node) => <NodeShape key={node.id} node={node} detail={variant === 'detail'} />)}
    </svg>
  );
}
