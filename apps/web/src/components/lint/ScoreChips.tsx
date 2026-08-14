import { scoreParts, type LintResult } from '@bpmn/rules';

type ScoreChipsProps = {
  lint: LintResult;
};

export function ScoreChips({ lint }: ScoreChipsProps) {
  const parts = scoreParts(lint);
  return (
    <span className={`lint-score-chips${lint.errors.length ? ' is-error' : ''}`} title={parts.join(' · ')}>
      {parts.map((part) => (
        <span key={part} className={chipTone(part, lint)}>
          {part}
        </span>
      ))}
    </span>
  );
}

function chipTone(part: string, lint: LintResult): string | undefined {
  if (part.startsWith('Execution ') && lint.scores.execution !== undefined && lint.scores.execution < 100) {
    return 'is-execution';
  }
  return undefined;
}
