import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProcessSummary } from '@bpmn/domain';
import { Mic, X } from 'lucide-react';
import { describeBpmnXml, descriptionInputIssue } from '../../lib/describeProcess';
import { MAX_DESCRIPTION_CHARS } from '../../lib/linearProcess';
import { previewBpmn, processNameFromDescription } from '../../lib/bpmnPreview';
import { Button } from '../ui/Button';
import { TextAreaField } from '../ui/TextAreaField';
import { BpmnSchematic } from './BpmnSchematic';

type RecognitionEvent = Event & { results: ArrayLike<{ 0: { transcript: string } }> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionConstructor = new () => Recognition;

type MobileProcessCaptureProps = {
  initialValue: string;
  templates: ProcessSummary[];
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onCreate: (description: string) => void;
  onUseTemplate: (template: ProcessSummary) => void;
};

const TEMPLATE_LABELS: Record<string, string> = {
  'starter:approval': 'Purchase approval',
  'starter:incident': 'Support escalation',
};

export function MobileProcessCapture({
  initialValue,
  templates,
  busy,
  error,
  onClose,
  onCreate,
  onUseTemplate,
}: MobileProcessCaptureProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const [value, setValue] = useState(initialValue);
  const [dictating, setDictating] = useState(false);
  const issue = descriptionInputIssue(value);
  const outline = useMemo(() => captureOutline(value), [value]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    textareaRef.current?.focus();
    return () => {
      recognitionRef.current?.stop();
      if (dialog.open) dialog.close();
    };
  }, []);

  const dictate = () => {
    const RecognitionApi = (
      window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
    ).SpeechRecognition ?? (
      window as typeof window & { webkitSpeechRecognition?: RecognitionConstructor }
    ).webkitSpeechRecognition;
    if (!RecognitionApi) {
      textareaRef.current?.focus();
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new RecognitionApi();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) setValue((current) => `${current}${current.trim() ? ' ' : ''}${transcript}`);
    };
    recognition.onend = () => setDictating(false);
    recognitionRef.current = recognition;
    setDictating(true);
    recognition.start();
  };

  return (
    <dialog
      ref={dialogRef}
      className="mobile-process-capture"
      aria-labelledby="mobile-capture-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="mobile-capture-title">New process</h2>
        <button type="button" aria-label="Close new process" onClick={onClose}>
          <X size={20} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </header>
      <div className="mobile-process-capture-body product-scrollbar">
        <span className="process-section-label">Describe → BPMN</span>
        <TextAreaField
          ref={textareaRef}
          value={value}
          rows={5}
          maxLength={MAX_DESCRIPTION_CHARS}
          aria-label="Describe the new process"
          aria-invalid={Boolean(issue) || undefined}
          placeholder="Client submits a request. A manager checks the details. If everything is correct, issue an invoice; otherwise request clarification."
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="mobile-process-capture-estimate">
          <span>{outline}</span>
          <Button variant="outline" size="sm" aria-pressed={dictating} onClick={dictate}>
            <Mic size={14} strokeWidth={1.8} aria-hidden="true" /> {dictating ? 'Listening…' : 'Dictate'}
          </Button>
        </div>
        {issue ? <p className="mobile-process-capture-error" role="alert">{issue}</p> : null}
        {!issue && error ? <p className="mobile-process-capture-error" role="alert">{error}</p> : null}

        <span className="process-section-label mobile-process-template-label">Or start from</span>
        <div className="mobile-process-template-list">
          {templates.slice(0, 3).map((template) => (
            <button key={template.id} type="button" disabled={busy} onClick={() => onUseTemplate(template)}>
              <span>
                <strong>{TEMPLATE_LABELS[template.id] ?? template.name}</strong>
                <small>{template.structure}</small>
              </span>
              <BpmnSchematic preview={template.preview} />
            </button>
          ))}
        </div>
      </div>
      <footer>
        <Button
          variant="accentSolid"
          size="md"
          loading={busy}
          disabled={!value.trim() || Boolean(issue)}
          onClick={() => onCreate(value)}
        >
          Create process
        </Button>
      </footer>
    </dialog>
  );
}

function captureOutline(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return 'Describe the work to estimate its structure';
  try {
    const name = processNameFromDescription(trimmed);
    const preview = previewBpmn(describeBpmnXml(name, trimmed));
    const clauses = trimmed.split(/[.!?;]+/u).filter((part) => part.trim()).length;
    return `${clauses} ${clauses === 1 ? 'clause' : 'clauses'} → ${preview.counts || 'BPMN process'}`;
  } catch {
    return 'Keep each step in a separate sentence';
  }
}
