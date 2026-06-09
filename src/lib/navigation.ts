import type { Href } from "expo-router";

type BackCapableRouter = {
  back: () => void;
  canGoBack?: () => boolean;
  replace: (href: Href) => void;
};

const RETRY_DELAYS_MS = [0, 50, 150, 300];

function warnNavigationFailure(error: unknown) {
  if (__DEV__) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[habitPro] navigation fallback failed", message);
  }
}

function tryBackOrReplace(router: BackCapableRouter, fallback: Href): boolean {
  try {
    if (router.canGoBack?.() === true) {
      router.back();
      return true;
    }
  } catch (error) {
    warnNavigationFailure(error);
  }

  try {
    router.replace(fallback);
    return true;
  } catch (error) {
    warnNavigationFailure(error);
    return false;
  }
}

function retryBackOrReplace(router: BackCapableRouter, fallback: Href, attempt: number) {
  const delay = RETRY_DELAYS_MS[attempt];
  if (delay == null) return;

  setTimeout(() => {
    if (tryBackOrReplace(router, fallback)) return;
    retryBackOrReplace(router, fallback, attempt + 1);
  }, delay);
}

export function backOrReplace(router: BackCapableRouter, fallback: Href): void {
  if (tryBackOrReplace(router, fallback)) return;
  retryBackOrReplace(router, fallback, 0);
}
