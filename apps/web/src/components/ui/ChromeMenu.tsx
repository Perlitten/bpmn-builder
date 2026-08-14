import { createContext, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from './Button';
import { useModal } from './useModal';

const CloseMenu = createContext<() => void>(() => {});

type ChromeMenuProps = {
  label: ReactNode;
  ariaLabel: string;
  disabled?: boolean;
  align?: 'left' | 'right';
  children: ReactNode;
};

export function nextMenuIndex(count: number, current: number, key: string): number | null {
  if (count <= 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown') return current < 0 || current >= count - 1 ? 0 : current + 1;
  if (key === 'ArrowUp') return current <= 0 ? count - 1 : current - 1;
  return null;
}

export function ChromeMenu({ label, ariaLabel, disabled, align = 'right', children }: ChromeMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const { ref: menuRef } = useModal({ open, onClose: () => setOpen(false) });

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const menu = menuRef.current;
    if (!menu) return;
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'));
    const current = items.findIndex((item) => item === document.activeElement);
    const next = nextMenuIndex(items.length, current, event.key);
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus();
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        {label}
      </Button>
      {open ? (
        <CloseMenu.Provider value={() => setOpen(false)}>
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={ariaLabel}
            tabIndex={-1}
            onKeyDown={onMenuKeyDown}
            className={`absolute top-full z-30 mt-1 min-w-[11rem] border border-border bg-canvas py-1 outline-none ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            {children}
          </div>
        </CloseMenu.Provider>
      ) : null}
    </div>
  );
}

type ChromeMenuItemProps = {
  onSelect: () => void;
  disabled?: boolean;
  children: ReactNode;
};

export function ChromeMenuItem({ onSelect, disabled, children }: ChromeMenuItemProps) {
  const close = useContext(CloseMenu);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="flex w-full flex-col items-start px-3 py-1.5 text-left text-sm text-ink outline-none hover:bg-surface focus-visible:bg-surface focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-1px] focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60"
      onClick={() => {
        close();
        onSelect();
      }}
    >
      {children}
    </button>
  );
}
