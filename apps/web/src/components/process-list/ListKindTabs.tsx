import { useEffect, useRef, type KeyboardEvent } from 'react';
import {
  LIST_PANEL_ID,
  LIST_TAB_ID,
  LIST_TAB_LABEL,
  LIST_TABS,
  nextListTab,
  type ListTab,
} from './listTabs';

type ListKindTabsProps = {
  kind: ListTab;
  onChange: (kind: ListTab) => void;
};

export function ListKindTabs({ kind, onChange }: ListKindTabsProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const active = document.activeElement;
    if (!root || !active || !root.contains(active)) return;
    const selected = root.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    selected?.focus();
  }, [kind]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nextListTab(kind, event.key);
    if (!next) return;
    event.preventDefault();
    onChange(next);
  };

  return (
    <div
      ref={rootRef}
      role="tablist"
      aria-label="Process list"
      className="flex items-center gap-1"
      onKeyDown={onKeyDown}
    >
      {LIST_TABS.map((tab) => {
        const selected = tab === kind;
        return (
          <button
            key={tab}
            id={LIST_TAB_ID[tab]}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={LIST_PANEL_ID}
            tabIndex={selected ? 0 : -1}
            className="ui-tab"
            onClick={() => onChange(tab)}
          >
            {LIST_TAB_LABEL[tab]}
          </button>
        );
      })}
    </div>
  );
}
