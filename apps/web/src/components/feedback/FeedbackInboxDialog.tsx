import { useEffect, useId, useState } from 'react';
import { Inbox, RefreshCw, X } from 'lucide-react';
import { api, type FeedbackItem } from '../../lib/api';
import { Button, DialogBackdrop, DialogSurface, IconButton } from '../ui';
import { useModal } from '../ui/useModal';

type FeedbackInboxDialogProps = { open: boolean; onClose: () => void };

function formatFeedbackDate(value: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function categoryLabel(value: FeedbackItem['category']): string {
  return value === 'ux' ? 'UX' : value.charAt(0).toUpperCase() + value.slice(1);
}

export function FeedbackInboxDialog({ open, onClose }: FeedbackInboxDialogProps) {
  const titleId = useId();
  const { ref } = useModal({ open, onClose });
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.listFeedback());
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Could not load feedback.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  if (!open) return null;

  return (
    <DialogBackdrop>
      <DialogSurface ref={ref} className="feedback-inbox" aria-labelledby={titleId}>
        <header className="feedback-dialog-header">
          <div>
            <span className="feedback-dialog-kicker"><Inbox size={13} aria-hidden /> Inbox</span>
            <h2 id={titleId} className="ui-dialog-title">Your feedback</h2>
          </div>
          <div className="feedback-inbox-actions">
            <Button variant="ghost" size="sm" disabled={loading} aria-label="Refresh feedback" title="Refresh feedback" onClick={() => void load()}>
              <RefreshCw size={14} aria-hidden />
            </Button>
            <IconButton label="Close feedback inbox" onClick={onClose} data-modal-initial-focus>
              <X size={16} aria-hidden />
            </IconButton>
          </div>
        </header>
        {loading ? <p className="feedback-inbox-state" role="status">Loading feedback…</p> : null}
        {error ? (
          <div className="feedback-inbox-state" role="alert">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button>
          </div>
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <div className="feedback-inbox-state">
            <p>No feedback yet. Send the first note from the account menu.</p>
          </div>
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <div className="feedback-list" aria-label="Submitted feedback">
            {items.map((item) => (
              <article className="feedback-item" key={item.id}>
                <div className="feedback-item-meta">
                  <span>{categoryLabel(item.category)}</span>
                  <time dateTime={item.createdAt}>{formatFeedbackDate(item.createdAt)}</time>
                </div>
                <p>{item.message}</p>
              </article>
            ))}
          </div>
        ) : null}
      </DialogSurface>
    </DialogBackdrop>
  );
}
