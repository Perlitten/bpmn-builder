import { useId } from 'react';
import type { ProcessMiniPreview } from '@bpmn/domain';

type BpmnSchematicProps = { preview: ProcessMiniPreview };

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

function positioned(preview: ProcessMiniPreview): PositionedNode[] {
  return preview.nodes.map((node, index) => ({
    ...node,
    px: typeof node.x === 'number' ? node.x : index * 140,
    py: typeof node.y === 'number' ? node.y : 0,
    ...dimensions(node.type),
  }));
}

function NodeShape({ node }: { node: PositionedNode }) {
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
      <path
        d={`M ${centerX} ${node.py + 1} L ${node.px + node.width - 1} ${centerY} L ${centerX} ${node.py + node.height - 1} L ${node.px + 1} ${centerY} Z`}
        fill="var(--color-canvas)"
        stroke="currentColor"
        strokeWidth="2"
      />
    );
  }
  const label = node.label.trim() || 'Task';
  return (
    <g>
      <rect
        x={node.px + 1}
        y={node.py + 1}
        width={node.width - 2}
        height={node.height - 2}
        rx="3"
        fill="var(--color-canvas)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <text x={centerX} y={centerY + 3} textAnchor="middle" fontSize="10" fill="currentColor">
        {label.length > 14 ? `${label.slice(0, 13)}…` : label}
      </text>
    </g>
  );
}

export function BpmnSchematic({ preview }: BpmnSchematicProps) {
  const markerId = `mini-arrow-${useId().replaceAll(':', '')}`;
  const nodes = positioned(preview);
  if (!nodes.length) return <span className="font-mono text-[10px] text-muted">No diagram</span>;

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const minX = Math.min(...nodes.map((node) => node.px)) - 8;
  const minY = Math.min(...nodes.map((node) => node.py)) - 8;
  const maxX = Math.max(...nodes.map((node) => node.px + node.width)) + 12;
  const maxY = Math.max(...nodes.map((node) => node.py + node.height)) + 8;

  return (
    <svg
      viewBox={`${minX} ${minY} ${Math.max(1, maxX - minX)} ${Math.max(1, maxY - minY)}`}
      className="block h-9 w-full text-ink"
      role="img"
      aria-label={preview.caption}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      {preview.edges.map((edge, index) => {
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        if (!source || !target) return null;
        return (
          <line
            key={`${edge.source}:${edge.target}:${index}`}
            x1={source.px + source.width}
            y1={source.py + source.height / 2}
            x2={target.px}
            y2={target.py + target.height / 2}
            stroke="currentColor"
            strokeWidth="2"
            markerEnd={`url(#${markerId})`}
          />
        );
      })}
      {nodes.map((node) => <NodeShape key={node.id} node={node} />)}
    </svg>
  );
}
