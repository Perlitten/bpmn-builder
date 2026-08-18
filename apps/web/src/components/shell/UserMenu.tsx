import { LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthGate';
import { ChromeMenu, ChromeMenuItem } from '../ui';

export function UserMenu() {
  const { user, signOut } = useAuth();
  const label = user.name?.trim() || user.email;

  return (
    <ChromeMenu
      align="right"
      ariaLabel="Account"
      label={
        <>
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-5 w-5 rounded-sm object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex h-5 w-5 items-center justify-center bg-surface font-mono text-[10px] text-ink">
              {label.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="hidden max-w-[9rem] truncate sm:inline">{label}</span>
        </>
      }
    >
      <div className="px-3 py-1.5 font-mono text-[11px] text-muted">{user.email}</div>
      <ChromeMenuItem icon={<LogOut size={14} strokeWidth={1.75} aria-hidden />} onSelect={() => void signOut()}>
        Sign out
      </ChromeMenuItem>
    </ChromeMenu>
  );
}
