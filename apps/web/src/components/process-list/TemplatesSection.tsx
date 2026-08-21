import type { ProcessSummary } from '@bpmn/domain';
import { Button } from '../ui/Button';
import { BpmnSchematic } from './BpmnSchematic';

type TemplatesSectionProps = {
  templates: ProcessSummary[];
  busy: boolean;
  onUse: (template: ProcessSummary) => void;
  onOpen?: (id: string) => void;
};

export function draftNameFromTemplate(name: string): string {
  return name.replace(/\s+template$/i, '').trim() || name;
}

export function TemplatesSection({ templates, busy, onUse, onOpen }: TemplatesSectionProps) {
  if (templates.length === 0) return null;

  return (
    <div>
      {templates.map((template) => (
        <div
          key={template.id}
          data-process-id={template.id}
          className="grid min-h-16 grid-cols-[9rem_minmax(8rem,1fr)_auto] items-center gap-3 border-b border-border px-4 py-2"
        >
          <span className="hidden min-w-0 sm:block">
            <BpmnSchematic preview={template.preview} />
          </span>
          <span className="min-w-0 truncate text-sm font-medium text-ink">{template.name}</span>
          <div className="flex items-center gap-1">
            {onOpen && !template.builtin ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onOpen(template.id)}>
                Edit
              </Button>
            ) : null}
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onUse(template)}>
              Use template
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
