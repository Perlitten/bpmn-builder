import { describe, expect, it } from 'vitest';
import {
  advanceShowcasePlayback,
  pointAtShowcasePath,
  SHOWCASE_GEOMETRIES,
  SHOWCASE_SCENARIOS,
  showcasePhaseDuration,
  showcaseXml,
  type ShowcasePlayback,
} from './showcaseAttract';

describe('landing attract-mode showcase', () => {
  it('keeps all four reference scenarios and builds complete geometry for each', () => {
    expect(SHOWCASE_SCENARIOS.map((scenario) => scenario.chipLabel)).toEqual([
      'Approve & pay',
      'Branch on amount',
      'Refund alert',
      'Ship & invoice',
    ]);

    SHOWCASE_GEOMETRIES.forEach((geometry, index) => {
      expect(geometry.shapes.length, SHOWCASE_SCENARIOS[index]?.id).toBeGreaterThanOrEqual(3);
      expect(geometry.edges.length, SHOWCASE_SCENARIOS[index]?.id).toBeGreaterThan(0);
      expect(geometry.paths.length, SHOWCASE_SCENARIOS[index]?.id).toBeGreaterThan(0);
      geometry.shapes.forEach((shape) => {
        expect(shape.cx).toBeGreaterThanOrEqual(0);
        expect(shape.cx).toBeLessThanOrEqual(500);
      });
    });

    expect(SHOWCASE_GEOMETRIES[1].paths).toHaveLength(2);
    expect(SHOWCASE_GEOMETRIES[1].gatewayOrder).toBeGreaterThanOrEqual(0);
  });

  it('advances through typing, building, simulation and the next scenario', () => {
    let playback: ShowcasePlayback = { scenarioIndex: 0, phase: 'type', elapsed: 0, lap: 1 };
    playback = advanceShowcasePlayback(playback, showcasePhaseDuration(0, 'type'));
    expect(playback).toMatchObject({ phase: 'build', elapsed: 0 });
    playback = advanceShowcasePlayback(playback, showcasePhaseDuration(0, 'build'));
    expect(playback).toMatchObject({ phase: 'run', elapsed: 0 });
    playback = advanceShowcasePlayback(playback, showcasePhaseDuration(0, 'run'));
    expect(playback).toMatchObject({ phase: 'off', elapsed: 0 });
    playback = advanceShowcasePlayback(playback, showcasePhaseDuration(0, 'off'));
    expect(playback).toEqual({ scenarioIndex: 1, phase: 'type', elapsed: 0, lap: 2 });
  });

  it('renders a BPMN XML excerpt and interpolates a token over branched paths', () => {
    expect(showcaseXml(1)).toContain('<bpmn:exclusiveGateway id="Gateway_1" />');
    expect(showcaseXml(1)).toContain('<bpmn:conditionExpression>amount &gt; 5000');

    const path = SHOWCASE_GEOMETRIES[1].paths[0];
    expect(pointAtShowcasePath(path, 0)).toEqual(path[0]);
    expect(pointAtShowcasePath(path, 1)).toEqual(path.at(-1));
    const midpoint = pointAtShowcasePath(path, 0.5);
    expect(midpoint.x).toBeGreaterThanOrEqual(0);
    expect(midpoint.x).toBeLessThanOrEqual(500);
  });
});
