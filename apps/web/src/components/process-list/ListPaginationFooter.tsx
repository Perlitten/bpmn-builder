import { Button } from '../ui/Button';

type ListPaginationFooterProps = {
  from: number;
  to: number;
  total: number;
  page: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
};

export function ListPaginationFooter({
  from,
  to,
  total,
  page,
  pageSize,
  onPrev,
  onNext,
}: ListPaginationFooterProps) {
  const totalPages = Math.ceil(total / pageSize);
  return (
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-canvas px-4 py-2 text-[12px] text-muted">
      <p aria-live="polite" className="tabular-nums">
        Showing {from}–{to} of {total}
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[12px]"
            disabled={page <= 1}
            onClick={onPrev}
          >
            Prev
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[12px]"
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
