import { scoreParts, type LintResult } from '@bpmn/rules';
import { Chip } from '../ui';
import { presentedFindings } from './lintPresentation';

type ScoreChipsProps = {
  lint: LintResult;
};

export function ScoreChips({ lint }: ScoreChipsProps) {
  const parts = scoreParts(lint);
  const count = presentedFindings(lint).length;
  return (
    <Chip className={`lint-score-chips${lint.errors.length ? ' is-error' : ''}`} aria-label={parts.join(' · ')}>
      {count ? `${count} ${count === 1 ? 'finding' : 'findings'}` : 'No findings'}
    </Chip>
  );
}
