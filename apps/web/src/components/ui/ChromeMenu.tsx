import { createContext, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from './Button';

const CloseMenu = createContext<() => void>(() => {});

type ChromeMenuProps = {
  label: ReactNode;
  ariaLabel: string;
  disabled?: boolean;
  align?: 'left' | 'right';
  triggerVariant?: 'ghost' | 'outline';
  triggerClassName?: string;
  menuClassName?: string;
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

export function ChromeMenu({
  label,
  ariaLabel,
  disabled,
  align = 'right',
  triggerVariant = 'outline',
  triggerClassName,
  menuClassName,
  children,
}: ChromeMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    });
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onEscape, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onEscape, true);
    };
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
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
        variant={triggerVariant}
        size="sm"
        className={triggerClassName}
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
            className={`ui-menu ${menuClassName ?? ''} ${
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
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  children: ReactNode;
};

export function ChromeMenuItem({ onSelect, disabled, icon, tone = 'default', children }: ChromeMenuItemProps) {
  const close = useContext(CloseMenu);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="ui-menu-item"
      data-tone={tone}
      onClick={() => {
        close();
        onSelect();
      }}
    >
      {icon ? (
        <span className="flex h-5 w-4 shrink-0 items-center justify-center" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-col items-start">{children}</span>
    </button>
  );
}
