import { useId } from 'react';
import { Button } from '../ui/Button';
import { TextAreaField } from '../ui/TextAreaField';

type ProcessComposerProps = {
  value: string;
  issue: string | null;
  busy: boolean;
  maxLength: number;
  placeholder: string;
  onChange: (value: string) => void;
  onCreate: () => void;
};

export function ProcessComposer({
  value,
  issue,
  busy,
  maxLength,
  placeholder,
  onChange,
  onCreate,
}: ProcessComposerProps) {
  const messageId = useId();
  return (
    <section className="process-composer" aria-labelledby={`${messageId}-label`}>
      <span id={`${messageId}-label`} className="process-section-label">Describe → BPMN</span>
      <TextAreaField
        value={value}
        rows={2}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label="Describe the process"
        aria-invalid={Boolean(issue) || undefined}
        aria-describedby={messageId}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !issue && value.trim()) {
            event.preventDefault();
            onCreate();
          }
        }}
      />
      <div className="process-composer-actions">
        <Button
          variant="accentSolid"
          size="sm"
          className="process-composer-submit"
          disabled={busy || !value.trim() || Boolean(issue)}
          loading={busy}
          onClick={onCreate}
        >
          Create process
        </Button>
        <span aria-hidden="true">⌘⏎</span>
      </div>
      <span id={messageId} className="process-composer-message" data-tone={issue ? 'danger' : undefined}>
        {issue ?? (value.length > maxLength * 0.7 ? `${value.length.toLocaleString()}/${maxLength.toLocaleString()}` : '')}
      </span>
    </section>
  );
}
