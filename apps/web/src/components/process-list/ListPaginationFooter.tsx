import { Button } from '../ui/Button';

type ListPaginationFooterProps = {
  from: number;
  to: number;
  total: number;
  page: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
};

export function ListPaginationFooter({
  from,
  to,
  total,
  page,
  pageSize,
  onPrev,
  onNext,
  className = '',
}: ListPaginationFooterProps) {
  const totalPages = Math.ceil(total / pageSize);
  return (
    <footer className={`flex shrink-0 items-center justify-between gap-3 border-t border-border bg-canvas px-4 py-2 text-[12px] text-muted ${className}`}>
      <p aria-live="polite" className="process-pagination-desktop tabular-nums">
        Showing {from}–{to} of {total}
      </p>
      <p aria-live="polite" className="process-pagination-mobile tabular-nums">
        {totalPages > 1
          ? `Page ${page} of ${totalPages} · ${total} ${total === 1 ? 'process' : 'processes'}`
          : `End of list · ${total} ${total === 1 ? 'process' : 'processes'}`}
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={onPrev}
          >
            Prev
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={page * pageSize >= total}
            onClick={onNext}
          >
            Next
          </Button>
        </div>
      ) : null}
    </footer>
  );
}
