import { useState } from 'react';
import { describeBpmnXml } from '../../lib/describeProcess';
import { SHOWCASE_EXAMPLES, type ShowcaseExample } from '../../lib/showcaseExamples';
import { ShowcaseViewer } from './ShowcaseViewer';

function countBpmnElements(xml: string | null): number {
  if (!xml) return 0;
  return (
    xml.match(
      /<bpmn:(?:startEvent|endEvent|task|userTask|serviceTask|exclusiveGateway|parallelGateway)\b/g,
    )?.length ?? 0
  );
}

export function ShowcaseDemo() {
  const [selectedId, setSelectedId] = useState<string>(SHOWCASE_EXAMPLES[0].id);
  const [text, setText] = useState<string>(SHOWCASE_EXAMPLES[0].description);
  const [showXml, setShowXml] = useState(false);

  let xml: string | null = null;
  let parseError: string | null = null;

  if (text.trim()) {
    try {
      xml = describeBpmnXml('Showcase process', text);
    } catch (err) {
      parseError = err instanceof Error ? err.message : 'Could not generate BPMN from this description.';
    }
  }

  const handleSelectExample = (example: ShowcaseExample) => {
    setSelectedId(example.id);
    setText(example.description);
    setShowXml(false);
  };

  const handleTextChange = (value: string) => {
    setText(value);
    setSelectedId('');
  };

  const elementCount = countBpmnElements(xml);
  const selectedExample = SHOWCASE_EXAMPLES.find((example) => example.id === selectedId);

  return (
    <div className="landing-panel overflow-hidden bg-canvas">
      <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 bg-ink px-3 py-2 font-mono text-[10px] font-medium tracking-[0.14em] text-canvas">
        <span>{parseError ? 'INVALID INPUT' : showXml ? 'CANONICAL XML' : 'LIVE INPUT'}</span>
        <span className="text-line-strong">TOKENS LIVE {String(elementCount).padStart(2, '0')}</span>
        <span className="text-line-strong">PATH {selectedExample?.label.toUpperCase() ?? 'CUSTOM'}</span>
        <button
          type="button"
          onClick={() => setShowXml((current) => !current)}
          disabled={!xml}
          className="ml-auto min-h-8 border-2 border-canvas px-2 text-[10px] tracking-[0.12em] text-canvas outline-none hover:bg-canvas hover:text-ink focus-visible:ring-2 focus-visible:ring-canvas focus-visible:ring-offset-2 focus-visible:ring-offset-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {showXml ? 'HIDE XML' : 'SHOW XML'}
        </button>
      </div>

      <div className="landing-scanlines relative">
        <div className="border-b border-line-strong px-4 pb-3 pt-3.5">
          <label htmlFor="showcase-description" className="font-mono text-[10px] font-medium tracking-[0.12em] text-ink-soft">
            YOU TYPE
          </label>
          <textarea
            id="showcase-description"
            value={text}
            rows={3}
            placeholder="Receive request, verify details, then approve or reject."
            className="mt-1.5 min-h-[72px] w-full resize-y border-0 bg-transparent p-0 font-mono text-sm leading-6 text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent"
            onChange={(event) => handleTextChange(event.target.value)}
          />
          {parseError ? (
            <p className="mt-2 border-2 border-danger-strong p-2 font-mono text-xs leading-5 text-danger-strong" role="alert">
              {parseError}
            </p>
          ) : null}
        </div>

        {showXml && xml ? (
          <div className="p-3 sm:p-4">
            <pre className="mx-auto max-h-[300px] max-w-[620px] overflow-auto border border-line-strong bg-canvas p-3 font-mono text-[11px] leading-5 text-ink">
              {xml}
            </pre>
          </div>
        ) : (
          <div className="min-h-[250px] p-2 sm:p-3">
            <div className="mx-auto h-[250px] max-w-[650px] overflow-hidden">
              {xml ? (
                <ShowcaseViewer xml={xml} />
              ) : (
                <div className="grid h-full place-items-center font-mono text-[10px] tracking-[0.14em] text-muted">
                  READING THE SENTENCE
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t-3 border-ink px-3 py-2.5">
        <span className="mr-1 font-mono text-[10px] font-medium tracking-[0.12em] text-ink-soft">PLAY</span>
        {SHOWCASE_EXAMPLES.map((example) => (
          <button
            key={example.id}
            type="button"
            aria-pressed={selectedId === example.id}
            className={`landing-chip ${selectedId === example.id ? 'landing-chip-active' : ''}`}
            onClick={() => handleSelectExample(example)}
          >
            {example.label.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
