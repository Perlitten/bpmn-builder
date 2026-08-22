import type { LintResult } from '@bpmn/rules';
import { Badge, Button } from '../../ui';
import { presentedFindings } from '../../lint/lintPresentation';

type ValidationPanelProps = {
  lint: LintResult;
  onClose: () => void;
  onSelect: (elementId: string) => void;
};

export function ValidationPanel({ lint, onClose, onSelect }: ValidationPanelProps) {
  const findings = presentedFindings(lint);
  return (
    <div className="element-validation">
      <header className="element-validation-head">
        <div>
          <h2>Validation</h2>
          <span>{findings.length} findings</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Done</Button>
      </header>
      {findings.length ? (
        <ul className="element-validation-list product-scrollbar">
          {findings.map((finding, index) => (
            <li key={`${finding.id}:${finding.elementId ?? ''}:${index}`}>
              <button
                type="button"
                disabled={!finding.elementId}
                onClick={() => finding.elementId && onSelect(finding.elementId)}
              >
                <Badge aria-label={`${finding.severity} finding`}>{index + 1}</Badge>
                <span>
                  <strong>{finding.message}</strong>
                  <small>{finding.elementId ?? 'Process-level finding'}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="element-validation-empty">No rule findings</p>
      )}
    </div>
  );
}
