import { snapToGrid, TOKENS } from './tokens.js';
import type { Bounds, Point } from './types.js';

export function centerY(box: Bounds): number {
  return box.y + box.height / 2;
}

export function isOrthogonal(waypoints: Point[]): boolean {
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1]!;
    const b = waypoints[i]!;
    if (a.x !== b.x && a.y !== b.y) return false;
  }
  return true;
}

export function routeOrthogonal(from: Bounds, to: Bounds, offset = 0): Point[] {
  const start = { x: from.x + from.width, y: centerY(from) };
  const end = { x: to.x, y: centerY(to) };
  if (offset && start.y === end.y) return routeAlongRail(start, end, 'y', offset);
  if (offset && start.x === end.x) return routeAlongRail(start, end, 'x', offset);
  if (start.x === end.x || start.y === end.y) return collapse([start, end]);

  const left = start.x + TOKENS.edgeClearance;
  const right = end.x - TOKENS.edgeClearance;
  const bendX =
    end.x > start.x && right >= left
      ? snapToGrid((left + right) / 2)
      : snapToGrid(start.x + TOKENS.edgeClearance);

  return collapse([start, { x: bendX, y: start.y }, { x: bendX, y: end.y }, end]);
}

/** U-detour so parallel edges between the same pair do not share one stroke. */
function routeAlongRail(start: Point, end: Point, axis: 'x' | 'y', offset: number): Point[] {
  const rail = snapToGrid((axis === 'y' ? start.y : start.x) + offset);
  if (axis === 'y') {
    if (rail === start.y) return collapse([start, end]);
    const stub = TOKENS.edgeClearance;
    const goingRight = end.x >= start.x;
    const x1 = start.x + (goingRight ? stub : -stub);
    const x2 = end.x - (goingRight ? stub : -stub);
    if ((goingRight && x2 >= x1) || (!goingRight && x1 >= x2)) {
      return collapse([
        start,
        { x: x1, y: start.y },
        { x: x1, y: rail },
        { x: x2, y: rail },
        { x: x2, y: end.y },
        end,
      ]);
    }
    return collapse([start, { x: start.x, y: rail }, { x: end.x, y: rail }, end]);
  }
  if (rail === start.x) return collapse([start, end]);
  const stub = TOKENS.edgeClearance;
  const goingDown = end.y >= start.y;
  const y1 = start.y + (goingDown ? stub : -stub);
  const y2 = end.y - (goingDown ? stub : -stub);
  if ((goingDown && y2 >= y1) || (!goingDown && y1 >= y2)) {
    return collapse([
      start,
      { x: start.x, y: y1 },
      { x: rail, y: y1 },
      { x: rail, y: y2 },
      { x: end.x, y: y2 },
      end,
    ]);
  }
  return collapse([start, { x: rail, y: start.y }, { x: rail, y: end.y }, end]);
}

/** Orthogonal route between stacked pools (bottom → top of the lower box). */
export function routeOrthogonalVertical(from: Bounds, to: Bounds, offsetX = 0): Point[] {
  const fromBelow = from.y + from.height <= to.y;
  const start = fromBelow
    ? { x: from.x + from.width / 2 + offsetX, y: from.y + from.height }
    : { x: from.x + from.width / 2 + offsetX, y: from.y };
  const end = fromBelow
    ? { x: to.x + to.width / 2 + offsetX, y: to.y }
    : { x: to.x + to.width / 2 + offsetX, y: to.y + to.height };
  if (start.x === end.x || start.y === end.y) return collapse([start, end]);
  const midY = snapToGrid((start.y + end.y) / 2);
  return collapse([start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]);
}

function collapse(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    const prev = out[out.length - 2];
    if (prev && last && colinear(prev, last, p)) {
      out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  return out;
}

function colinear(a: Point, b: Point, c: Point): boolean {
  return (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
}
