import type { ProcessSummary } from '@bpmn/domain';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { BpmnSchematic } from './BpmnSchematic';

const TEMPLATE_LABELS: Record<string, string> = {
  'starter:approval': 'Purchase approval',
  'starter:incident': 'Support escalation',
};

type ProcessEmptyStateProps = {
  value: string;
  issue: string | null;
  busy: boolean;
  placeholder: string;
  templates: ProcessSummary[];
  onChange: (value: string) => void;
  onCreate: () => void;
  onUseTemplate: (template: ProcessSummary) => void;
};

export function ProcessEmptyState({
  value,
  issue,
  busy,
  placeholder,
  templates,
  onChange,
  onCreate,
  onUseTemplate,
}: ProcessEmptyStateProps) {
  return (
    <section className="process-empty-state">
      <h1>Describe a process in plain sentences</h1>
      <p>One step per clause. You get real BPMN 2.0 — tasks, gateways, end events — and land straight in the editor.</p>
      <div className="process-empty-composer">
        <TextField
          value={value}
          maxLength={20_000}
          placeholder={placeholder}
          aria-label="Describe the first process"
          aria-invalid={Boolean(issue) || undefined}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && value.trim() && !issue) {
              event.preventDefault();
              onCreate();
            }
          }}
        />
        <Button variant="accentSolid" size="md" loading={busy} disabled={!value.trim() || Boolean(issue)} onClick={onCreate}>
          Create process
        </Button>
      </div>
      {issue ? <p className="process-empty-error" role="alert">{issue}</p> : null}
      {templates.length ? (
        <>
          <span className="process-empty-divider">or open a template</span>
          <div className="process-empty-templates">
            {templates.slice(0, 3).map((template) => (
              <button key={template.id} type="button" disabled={busy} onClick={() => onUseTemplate(template)}>
                <BpmnSchematic preview={template.preview} />
                <strong>{TEMPLATE_LABELS[template.id] ?? template.name}</strong>
                <span>{template.structure}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
