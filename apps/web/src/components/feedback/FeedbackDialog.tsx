import { useEffect, useId, useState } from 'react';
import { Check, MessageSquarePlus, X } from 'lucide-react';
import { api, type FeedbackCategory } from '../../lib/api';
import { Button, DialogActions, DialogBackdrop, DialogSurface, IconButton, SelectField, TextAreaField } from '../ui';
import { useModal } from '../ui/useModal';

const CATEGORIES: Array<{ value: FeedbackCategory; label: string }> = [
  { value: 'general', label: 'General feedback' },
  { value: 'bug', label: 'Bug report' },
  { value: 'idea', label: 'Product idea' },
  { value: 'ux', label: 'UX / visual issue' },
  { value: 'question', label: 'Question' },
];

type FeedbackDialogProps = {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
};

export function FeedbackDialog({ open, onClose, onSent }: FeedbackDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const { ref } = useModal({ open, onClose });
  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory('general');
    setMessage('');
    setBusy(false);
    setError(null);
    setSent(false);
  }, [open]);

  if (!open) return null;

  async function submit(): Promise<void> {
    const trimmed = message.trim();
    if (!trimmed) {
      setError('Write a message before sending.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.sendFeedback({ category, message: trimmed, page: window.location.pathname });
      setSent(true);
      onSent?.();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Could not save feedback. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogBackdrop>
      <DialogSurface ref={ref} className="feedback-dialog" aria-labelledby={titleId} aria-describedby={bodyId}>
        <header className="feedback-dialog-header">
          <div>
            <span className="feedback-dialog-kicker"><MessageSquarePlus size={13} aria-hidden /> Feedback</span>
            <h2 id={titleId} className="ui-dialog-title">Tell me what to improve</h2>
          </div>
          <IconButton label="Close feedback" onClick={onClose} data-modal-initial-focus={sent ? undefined : true}>
            <X size={16} aria-hidden />
          </IconButton>
        </header>
        {sent ? (
          <div className="feedback-success" role="status">
            <span className="feedback-success-icon"><Check size={18} aria-hidden /></span>
            <h3>Feedback received</h3>
            <p id={bodyId}>Thanks. It is saved to your feedback inbox so it does not get lost.</p>
            <DialogActions>
              <Button variant="accentSolid" size="sm" data-modal-initial-focus onClick={onClose}>Done</Button>
            </DialogActions>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <p id={bodyId} className="ui-dialog-body">Send a note about the product, a bug, or an idea. It will be stored with your account.</p>
            <label className="feedback-field">
              <span className="ui-field-label">Type</span>
              <SelectField value={category} onChange={(event) => setCategory(event.target.value as FeedbackCategory)}>
                {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </SelectField>
            </label>
            <label className="feedback-field">
              <span className="ui-field-label">Message</span>
              <TextAreaField
                autoFocus
                value={message}
                maxLength={5000}
                placeholder="What happened or what should feel better?"
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? `${bodyId}-error` : undefined}
                onChange={(event) => setMessage(event.target.value)}
              />
              <span className="feedback-count">{message.length.toLocaleString()} / 5,000</span>
            </label>
            {error ? <p id={`${bodyId}-error`} className="ui-field-message" data-tone="danger" role="alert">{error}</p> : null}
            <DialogActions>
              <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>Cancel</Button>
              <Button variant="accentSolid" size="sm" type="submit" loading={busy} loadingLabel="Sending…">Send feedback</Button>
            </DialogActions>
          </form>
        )}
      </DialogSurface>
    </DialogBackdrop>
  );
}
