export type DuplicateDialogDecision = { action: 'cancel' } | { action: 'confirm'; name: string };

export function duplicateRequestFromDialog(decision: DuplicateDialogDecision): { name: string } | null {
  if (decision.action === 'cancel') return null;
  const name = decision.name.trim();
  return name ? { name } : null;
}
