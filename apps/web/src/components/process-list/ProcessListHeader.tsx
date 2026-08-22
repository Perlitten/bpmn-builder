import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { TextField } from '../ui/TextField';
import { ListArchitectMascot } from './ListArchitectMascot';

type ProcessListHeaderProps = {
  query: string;
  total: number;
  empty?: boolean;
  buildVersion: string;
  searchLabel: string;
  actions: ReactNode;
  account: ReactNode;
  onQueryChange: (query: string) => void;
};

export function ProcessListHeader({
  query,
  total,
  empty = false,
  buildVersion,
  searchLabel,
  actions,
  account,
  onQueryChange,
}: ProcessListHeaderProps) {
  const [mobileSearch, setMobileSearch] = useState(Boolean(query));
  const mobileSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mobileSearch) mobileSearchRef.current?.focus();
  }, [mobileSearch]);

  return (
    <header className="process-list-header" data-empty={empty || undefined}>
      <div className="process-list-brand">
        <span>BPMN</span>
        {empty ? (
          <span className="process-list-empty-section">
            <span>Processes</span>
            <span>{total}</span>
          </span>
        ) : <span className="process-list-build">{buildVersion}</span>}
        <span className="process-list-mobile-count">{total}</span>
      </div>

      <div className="process-list-desktop-actions">
        {!empty ? (
          <>
            <label className="process-search">
              <span className="sr-only">{searchLabel}</span>
              <Search size={14} strokeWidth={1.8} aria-hidden="true" />
              <TextField
                type="search"
                value={query}
                variant="plain"
                placeholder={searchLabel}
                onChange={(event) => onQueryChange(event.target.value)}
              />
            </label>
            <ListArchitectMascot />
          </>
        ) : null}
        {actions}
        {!empty ? <span className="process-list-header-divider" aria-hidden="true" /> : null}
        {account}
      </div>

      <div className="process-list-mobile-actions">
        <button
          type="button"
          className="process-list-icon-button"
          aria-label={mobileSearch ? 'Close search' : searchLabel}
          aria-expanded={mobileSearch}
          onClick={() => {
            if (mobileSearch && query) onQueryChange('');
            setMobileSearch((current) => !current);
          }}
        >
          {mobileSearch ? <X size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
        </button>
        <ListArchitectMascot />
        {account}
      </div>

      {mobileSearch ? (
        <label className="process-search process-search-mobile">
          <span className="sr-only">{searchLabel}</span>
          <Search size={14} strokeWidth={1.8} aria-hidden="true" />
          <TextField
            ref={mobileSearchRef}
            type="search"
            value={query}
            variant="plain"
            placeholder={searchLabel}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
      ) : null}
    </header>
  );
}
