import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ShowcaseDiagram } from './ShowcaseDiagram';
import {
  advanceShowcasePlayback,
  pointAtShowcasePath,
  SHOWCASE_GEOMETRIES,
  SHOWCASE_RUN_MS,
  SHOWCASE_SCENARIOS,
  SHOWCASE_TICK_MS,
  showcaseXml,
  type ShowcasePlayback,
} from './showcaseAttract';
import './showcase.css';

const PHASE_LABELS: Record<ShowcasePlayback['phase'], string> = {
  type: 'TYPING',
  build: 'BUILDING',
  run: 'SIMULATING',
  off: 'ATTRACT MODE',
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduced;
}

function useIsVisible(target: RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const element = target.current;
    if (!element || typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: '80px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [target]);

  return visible;
}

export function ShowcaseDemo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const isVisible = useIsVisible(rootRef);
  const [showXml, setShowXml] = useState(false);
  const [playback, setPlayback] = useState<ShowcasePlayback>({
    scenarioIndex: 0,
    phase: 'type',
    elapsed: 0,
    lap: 1,
  });

  useEffect(() => {
    if (reducedMotion) {
      setPlayback((current) => ({ ...current, scenarioIndex: 1, phase: 'run', elapsed: 2_200 }));
      return;
    }
    if (showXml || !isVisible) return;
    const interval = window.setInterval(() => {
      setPlayback((current) => advanceShowcasePlayback(current));
    }, SHOWCASE_TICK_MS);
    return () => window.clearInterval(interval);
  }, [isVisible, reducedMotion, showXml]);

  const scenario = SHOWCASE_SCENARIOS[playback.scenarioIndex] ?? SHOWCASE_SCENARIOS[0];
  const geometry = SHOWCASE_GEOMETRIES[playback.scenarioIndex] ?? SHOWCASE_GEOMETRIES[0];
  const branchIndex = scenario.branches ? playback.lap % scenario.branches.length : 0;

  const visibleShapeCount = useMemo(() => {
    if (reducedMotion || showXml || playback.phase === 'run' || playback.phase === 'off') {
      return geometry.shapes.length;
    }
    if (playback.phase === 'build') {
      return Math.min(geometry.shapes.length, Math.floor(playback.elapsed / 190) + 1);
    }
    return 0;
  }, [geometry.shapes.length, playback.elapsed, playback.phase, reducedMotion, showXml]);

  const tokenProgress = useMemo(() => {
    if (reducedMotion) return [0.62];
    if (playback.phase !== 'run' || showXml) return [];
    const phaseProgress = playback.elapsed / SHOWCASE_RUN_MS;
    return [0, 0.2, 0.4, 0.6]
      .map((offset) => (phaseProgress - offset) * 1.6)
      .filter((progress) => progress >= 0 && progress <= 1);
  }, [playback.elapsed, playback.phase, reducedMotion, showXml]);

  const path = geometry.paths[Math.min(branchIndex, geometry.paths.length - 1)] ?? [];
  const tokenPoints = tokenProgress.map((progress) => pointAtShowcasePath(path, progress));
  const typed =
    reducedMotion || showXml || playback.phase !== 'type'
      ? scenario.phrase
      : scenario.phrase.slice(0, Math.floor(playback.elapsed / 52));
  const phaseLabel = reducedMotion
    ? 'STATIC FRAME'
    : showXml
      ? 'BPMN XML EXCERPT'
      : PHASE_LABELS[playback.phase];
  const pathLabel = scenario.branchLabels?.[branchIndex] ?? 'SINGLE';
  const gatewayHot = tokenProgress.some((progress) => progress > 0.3 && progress < 0.52);

  const pickScenario = (scenarioIndex: number) => {
    setShowXml(false);
    setPlayback({ scenarioIndex, phase: reducedMotion ? 'run' : 'type', elapsed: 0, lap: 1 });
  };

  return (
    <div ref={rootRef} className="landing-panel showcase-demo overflow-hidden bg-canvas">
      <div className="showcase-statusbar">
        <span>{phaseLabel}</span>
        <span className="showcase-status-muted">TOKENS LIVE {String(tokenPoints.length).padStart(2, '0')}</span>
        <span className="showcase-status-muted">PATH {pathLabel}</span>
        <button
          type="button"
          onClick={() => setShowXml((current) => !current)}
          className={`showcase-xml-toggle ${showXml ? 'showcase-xml-toggle-active' : ''}`}
        >
          {showXml ? 'HIDE XML' : 'SHOW XML'}
        </button>
      </div>

      <div className="landing-scanlines relative">
        <div className="showcase-typed">
          <span className="showcase-caption">YOU TYPE</span>
          <p data-testid="showcase-typed-phrase">
            <span className="sr-only">{scenario.phrase}</span>
            <span aria-hidden="true">{typed}</span>
            <span className="showcase-cursor" aria-hidden="true" />
          </p>
        </div>

        {showXml ? (
          <div className="showcase-viewport">
            <pre className="showcase-xml" data-testid="showcase-xml">
              {showcaseXml(playback.scenarioIndex)}
            </pre>
          </div>
        ) : (
          <div className="showcase-viewport">
            <ShowcaseDiagram
              scenario={scenario}
              geometry={geometry}
              visibleShapeCount={visibleShapeCount}
              tokenPoints={tokenPoints}
              branchIndex={branchIndex}
              gatewayHot={gatewayHot}
            />
          </div>
        )}
      </div>

      <div className="showcase-playbar">
        <span className="showcase-caption">PLAY</span>
        {SHOWCASE_SCENARIOS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={playback.scenarioIndex === index}
            className={`landing-chip ${playback.scenarioIndex === index ? 'landing-chip-active' : ''}`}
            onClick={() => pickScenario(index)}
          >
            {item.chipLabel.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
