import { useState } from 'react';
import { describeBpmnXml } from '../../lib/describeProcess';
import { SHOWCASE_EXAMPLES, type ShowcaseExample } from '../../lib/showcaseExamples';
import { ShowcaseViewer } from './ShowcaseViewer';

export function ShowcaseDemo() {
  const [selectedId, setSelectedId] = useState<string>(SHOWCASE_EXAMPLES[0].id);
  const [text, setText] = useState<string>(SHOWCASE_EXAMPLES[0].description);

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
  };

  const handleTextChange = (val: string) => {
    setText(val);
    setSelectedId('');
  };

  return (
    <div className="w-full rounded border border-border bg-canvas p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">Examples:</span>
        {SHOWCASE_EXAMPLES.map((ex) => (
          <button
            key={ex.id}
            type="button"
            aria-pressed={selectedId === ex.id}
            className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
              selectedId === ex.id
                ? 'border-ink bg-ink text-canvas'
                : 'border-border bg-surface text-ink hover:border-ink/50'
            }`}
            onClick={() => handleSelectExample(ex)}
          >
            {ex.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col">
          <label htmlFor="showcase-description" className="mb-1 text-xs font-semibold tracking-tight text-ink">
            Describe a process
          </label>
          <textarea
            id="showcase-description"
            value={text}
            rows={4}
            placeholder="e.g. Receive request, then verify details, then approve or reject."
            className="w-full flex-1 rounded border border-border bg-canvas p-2.5 text-sm text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent"
            onChange={(e) => handleTextChange(e.target.value)}
          />
          {parseError ? (
            <p className="mt-2 rounded border border-danger/40 bg-surface px-3 py-2 text-xs text-danger" role="alert">
              {parseError}
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-muted">
              Text is parsed on the fly into canonical BPMN 2.0 XML and rendered live on the right.
            </p>
          )}
        </div>

        <div className="relative min-h-[220px] rounded border border-border bg-surface overflow-hidden">
          {xml ? (
            <ShowcaseViewer xml={xml} />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-xs text-muted">
              {parseError ? 'Fix the description to update the diagram.' : 'Type a process description to see the diagram.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
