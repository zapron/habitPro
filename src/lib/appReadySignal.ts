/**
 * One-shot signal for "the splash overlay has actually finished dismissing, so
 * the app is now visible to the user." Components that play a mount-triggered
 * "welcome" animation (e.g. HabitCard's stack-up entrance) should wait for this
 * before starting on the very first app launch — otherwise the animation runs
 * to completion behind the still-opaque splash overlay (SplashGate mounts
 * `children` immediately, underneath the overlay) and the user never actually
 * sees it play. Every mount *after* the first (tab switches, navigating back)
 * fires the callback immediately, since `ready` is already true by then.
 */
let ready = false;
const listeners = new Set<() => void>();

export function markAppReady(): void {
  if (ready) return;
  ready = true;
  listeners.forEach((listener) => listener());
  listeners.clear();
}

export function isAppReady(): boolean {
  return ready;
}

/** Returns an unsubscribe function; safe to call after the callback already fired. */
export function onAppReady(callback: () => void): () => void {
  if (ready) {
    callback();
    return () => {};
  }
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
