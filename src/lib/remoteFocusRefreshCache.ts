const lastRemoteFocusRefreshAtByUserId = new Map<string, number>();
let lastRemoteFocusUserId: string | null = null;

export function getRemoteFocusLastRefreshAt(userId: string): number {
  if (lastRemoteFocusUserId !== userId) {
    lastRemoteFocusRefreshAtByUserId.clear();
    lastRemoteFocusUserId = userId;
  }
  return lastRemoteFocusRefreshAtByUserId.get(userId) ?? 0;
}

export function markRemoteFocusRefreshFresh(userId: string | null | undefined) {
  if (!userId) return;
  if (lastRemoteFocusUserId !== userId) {
    lastRemoteFocusRefreshAtByUserId.clear();
    lastRemoteFocusUserId = userId;
  }
  lastRemoteFocusRefreshAtByUserId.set(userId, Date.now());
}

export function invalidateRemoteFocusRefresh(userId: string | null | undefined) {
  if (!userId) {
    lastRemoteFocusUserId = null;
    lastRemoteFocusRefreshAtByUserId.clear();
    return;
  }
  lastRemoteFocusRefreshAtByUserId.delete(userId);
}
