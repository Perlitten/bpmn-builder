import { useId } from 'react';
import type { ShowcaseGeometry, ShowcasePoint, ShowcaseScenario, ShowcaseShape } from './showcaseAttract';

type ShowcaseDiagramProps = {
  scenario: ShowcaseScenario;
  geometry: ShowcaseGeometry;
  visibleShapeCount: number;
  tokenPoints: ShowcasePoint[];
  branchIndex: number;
  gatewayHot: boolean;
};

function edgePath(points: ShowcasePoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function octagonPoints(shape: ShowcaseShape): string {
  const left = shape.cx - shape.width / 2;
  const right = shape.cx + shape.width / 2;
  const top = shape.cy - shape.height / 2;
  const bottom = shape.cy + shape.height / 2;
  const inset = 10;
  return [
    `${left + inset},${top}`,
    `${right - inset},${top}`,
    `${right},${top + inset}`,
    `${right},${bottom - inset}`,
    `${right - inset},${bottom}`,
    `${left + inset},${bottom}`,
    `${left},${bottom - inset}`,
    `${left},${top + inset}`,
  ].join(' ');
}

function ShowcaseShapeGlyph({ shape, hot }: { shape: ShowcaseShape; hot: boolean }) {
  if (shape.kind === 'task') {
    return (
      <g className="showcase-shape showcase-task">
        <rect
          x={shape.cx - shape.width / 2}
          y={shape.cy - shape.height / 2}
          width={shape.width}
          height={shape.height}
        />
        <text x={shape.cx} y={shape.cy} dy="0.34em">
          {shape.label}
        </text>
      </g>
    );
  }

  if (shape.kind === 'gateway') {
    const half = shape.height / 2;
    return (
      <polygon
        className={`showcase-shape showcase-gateway ${hot ? 'showcase-gateway-hot' : ''}`}
        points={`${shape.cx},${shape.cy - half} ${shape.cx + half},${shape.cy} ${shape.cx},${shape.cy + half} ${shape.cx - half},${shape.cy}`}
      />
    );
  }

  return (
    <polygon
      className={`showcase-shape ${shape.kind === 'end' ? 'showcase-end' : 'showcase-start'}`}
      points={octagonPoints(shape)}
    />
  );
}

function ShowcaseShapeSilhouette({ shape }: { shape: ShowcaseShape }) {
  if (shape.kind === 'task') {
    return (
      <rect
        x={shape.cx - shape.width / 2}
        y={shape.cy - shape.height / 2}
        width={shape.width}
        height={shape.height}
      />
    );
  }

  if (shape.kind === 'gateway') {
    const half = shape.height / 2;
    return (
      <polygon
        points={`${shape.cx},${shape.cy - half} ${shape.cx + half},${shape.cy} ${shape.cx},${shape.cy + half} ${shape.cx - half},${shape.cy}`}
      />
    );
  }

  return <polygon points={octagonPoints(shape)} />;
}

function ShowcaseTokens({ points, className }: { points: ShowcasePoint[]; className?: string }) {
  return points.map((point, index) => (
    <rect
      className={`showcase-token${className ? ` ${className}` : ''}`}
      x={Math.round(point.x - 5)}
      y={Math.round(point.y - 5)}
      width="10"
      height="10"
      key={`${index}-${Math.round(point.x)}-${Math.round(point.y)}`}
    />
  ));
}

export function ShowcaseDiagram({
  scenario,
  geometry,
  visibleShapeCount,
  tokenPoints,
  branchIndex,
  gatewayHot,
}: ShowcaseDiagramProps) {
  const instanceId = useId().replace(/:/g, '');
  const tokenOutsideMaskId = `showcase-token-outside-${instanceId}`;
  const tokenInsideClipId = `showcase-token-inside-${instanceId}`;
  const frostedFilterId = `showcase-token-frost-${instanceId}`;
  const choice = scenario.branchLabels?.[branchIndex];
  const choiceX = geometry.branchChoiceX[branchIndex];

  return (
    <div className="showcase-stage" data-testid="showcase-preview">
      <svg
        viewBox="0 0 500 152"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Animated BPMN preview for: ${scenario.phrase}`}
        shapeRendering="crispEdges"
      >
        <defs>
          <marker
            id="showcase-arrow"
            viewBox="0 0 11 14"
            refX="10"
            refY="7"
            markerWidth="11"
            markerHeight="14"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path className="showcase-arrow" d="M 0 0 L 11 7 L 0 14 Z" />
          </marker>
          <mask id={tokenOutsideMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="500" height="152">
            <rect x="0" y="0" width="500" height="152" fill="white" />
            <g fill="black">
              {geometry.shapes.map((shape) => <ShowcaseShapeSilhouette key={`mask-${shape.order}`} shape={shape} />)}
            </g>
          </mask>
          <clipPath id={tokenInsideClipId} clipPathUnits="userSpaceOnUse">
            {geometry.shapes.map((shape) => <ShowcaseShapeSilhouette key={`clip-${shape.order}`} shape={shape} />)}
          </clipPath>
          <filter id={frostedFilterId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>

        {geometry.edges
          .filter((edge) => edge.order < visibleShapeCount)
          .map((edge, index) => (
            <path
              className="showcase-edge"
              d={edgePath(edge.points)}
              markerEnd="url(#showcase-arrow)"
              key={`${edge.order}-${index}`}
            />
          ))}

        <g clipPath={`url(#${tokenInsideClipId})`} filter={`url(#${frostedFilterId})`}>
          <ShowcaseTokens points={tokenPoints} className="showcase-token-frosted" />
        </g>

        {geometry.shapes.slice(0, visibleShapeCount).map((shape) => (
          <ShowcaseShapeGlyph
            key={`${shape.kind}-${shape.order}`}
            shape={shape}
            hot={shape.order === geometry.gatewayOrder && gatewayHot}
          />
        ))}

        {choice && choiceX !== undefined && visibleShapeCount >= geometry.shapes.length ? (
          <g className="showcase-choice" transform={`translate(${choiceX} ${branchIndex === 0 ? 2 : 94})`}>
            <rect x="-42" y="0" width="84" height="18" />
            <text x="0" y="9" dy="0.34em">
              {choice}
            </text>
          </g>
        ) : null}

        <g mask={`url(#${tokenOutsideMaskId})`}>
          <ShowcaseTokens points={tokenPoints} />
        </g>

        {visibleShapeCount === 0 ? (
          <text className="showcase-waiting" x="250" y="76" textAnchor="middle" dy="0.34em">
            READING THE SENTENCE
          </text>
        ) : null}
      </svg>
    </div>
  );
}
