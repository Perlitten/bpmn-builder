import { useState } from 'react';
import { Inbox, LayoutList, LogOut, MessageSquarePlus, Pencil } from 'lucide-react';
import { useAuth } from '../auth/AuthGate';
import { Avatar, ChromeMenu, ChromeMenuItem } from '../ui';
import { FeedbackDialog } from '../feedback/FeedbackDialog';
import { FeedbackInboxDialog } from '../feedback/FeedbackInboxDialog';
import { RenameSelfDialog } from './RenameSelfDialog';

export function UserMenu({ compact = false, diagramCount }: { compact?: boolean; diagramCount?: number }) {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState(user.name?.trim() || user.email);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  return (
    <>
      <ChromeMenu
        align="right"
        ariaLabel="Account"
        triggerVariant={compact ? 'ghost' : 'outline'}
        triggerClassName={compact ? undefined : 'user-menu-trigger'}
        menuClassName="account-menu"
        label={
          <>
            <Avatar name={displayName} src={user.avatarUrl} />
            {compact ? null : <span className="hidden max-w-[9rem] truncate sm:inline">{displayName}</span>}
          </>
        }
      >
        <div className="account-menu-profile">
          <Avatar name={displayName} src={user.avatarUrl} />
          <span>
            <strong>{displayName}</strong>
            <small>{user.email}</small>
          </span>
        </div>
        <div className="account-menu-stats" aria-label="Account activity">
          <span><strong>{diagramCount ?? '—'}</strong><small>diagrams</small></span>
          <span><strong>—</strong><small>elements</small></span>
          <span><strong>—</strong><small>since edit</small></span>
        </div>
        <ChromeMenuItem icon={<Pencil size={14} strokeWidth={1.75} aria-hidden />} onSelect={() => setRenameOpen(true)}>
          Rename yourself
        </ChromeMenuItem>
        <ChromeMenuItem icon={<LayoutList size={14} strokeWidth={1.75} aria-hidden />} onSelect={() => { window.location.assign('/'); }}>
          Your diagrams
        </ChromeMenuItem>
        <ChromeMenuItem icon={<MessageSquarePlus size={14} strokeWidth={1.75} aria-hidden />} onSelect={() => setFeedbackOpen(true)}>
          Send feedback
        </ChromeMenuItem>
        <ChromeMenuItem icon={<Inbox size={14} strokeWidth={1.75} aria-hidden />} onSelect={() => setInboxOpen(true)}>
          Feedback inbox
        </ChromeMenuItem>
        <ChromeMenuItem icon={<LogOut size={14} strokeWidth={1.75} aria-hidden />} tone="danger" onSelect={() => void signOut()}>
          Sign out
        </ChromeMenuItem>
      </ChromeMenu>
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <FeedbackInboxDialog open={inboxOpen} onClose={() => setInboxOpen(false)} />
      <RenameSelfDialog
        open={renameOpen}
        initialName={displayName}
        onClose={() => setRenameOpen(false)}
        onSaved={setDisplayName}
      />
    </>
  );
}
