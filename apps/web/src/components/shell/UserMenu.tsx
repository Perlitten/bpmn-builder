import { LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthGate';
import { Avatar, ChromeMenu, ChromeMenuItem } from '../ui';

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { user, signOut } = useAuth();
  const label = user.name?.trim() || user.email;

  return (
    <ChromeMenu
      align="right"
      ariaLabel="Account"
      triggerVariant={compact ? 'ghost' : 'outline'}
      label={
        <>
          <Avatar name={label} src={user.avatarUrl} />
          {compact ? null : <span className="hidden max-w-[9rem] truncate sm:inline">{label}</span>}
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
