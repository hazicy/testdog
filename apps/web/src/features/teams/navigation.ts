import { createId } from '@/client/id';

export const workspaceChangeKey = 'testdog-workspace-change';

export function reloadWorkspace(destination: string) {
  try {
    localStorage.setItem(workspaceChangeKey, createId());
  } catch {
    // Requests also check the document's workspace if storage is unavailable.
  }

  // A document navigation clears caches, subscriptions and pending requests together.
  window.location.assign(destination);
}
